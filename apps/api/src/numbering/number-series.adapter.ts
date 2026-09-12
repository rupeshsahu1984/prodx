import type { NumberSeriesKey, NumberSeriesPort } from '@prodx/core'
import type { Prisma } from '@prodx/db'

/**
 * The locking UPDATE behind ADR 0008.
 *
 * It MUST run in the same transaction as the document insert — that is what
 * makes a rolled-back document return its number. The transaction client is
 * therefore a constructor argument, not an injected singleton: there is no way
 * to use this adapter outside a transaction by accident.
 */
export class PrismaNumberSeriesAdapter implements NumberSeriesPort {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async allocate(key: NumberSeriesKey): Promise<{ value: number; format: string } | null> {
    const rows = await this.tx.$queryRaw<Array<{ value: number; format: string }>>`
      UPDATE number_series
         SET next_value = next_value + 1
       WHERE tenant_id        = ${key.tenantId}::uuid
         AND legal_entity_id  = ${key.legalEntityId}::uuid
         AND series_code      = ${key.seriesCode}
         AND fiscal_year      = ${key.fiscalYear}
      RETURNING next_value - 1 AS value, format
    `
    return rows[0] ?? null
  }
}
