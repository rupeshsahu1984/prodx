import type { IdempotencyKey, IdempotencyPort, StoredAttempt } from '@prodx/core'
import { platformScope, withScope, type Prisma } from '@prodx/db'

/**
 * Backs the idempotency port with the unique constraint on
 * (tenant_id, source, external_ref).
 *
 * Runs on the platform scope on purpose: a device retry must be recognised
 * whatever the caller's plant scope, and the key row carries no business data.
 * Recognition is the whole point — narrowing it here would let a retry from a
 * differently scoped session create a duplicate event.
 */
export class PrismaIdempotencyAdapter implements IdempotencyPort {
  async find(key: IdempotencyKey): Promise<StoredAttempt | null> {
    const row = await withScope(platformScope(key.tenantId), (tx) =>
      tx.idempotencyKey.findUnique({
        where: {
          tenantId_source_externalRef: {
            tenantId: key.tenantId,
            source: key.source,
            externalRef: key.externalRef,
          },
        },
      }),
    )
    return row === null ? null : { requestHash: row.requestHash, response: row.response }
  }

  async reserve(key: IdempotencyKey, requestHash: string): Promise<'RESERVED' | 'ALREADY_EXISTS'> {
    try {
      await withScope(platformScope(key.tenantId), (tx) =>
        tx.idempotencyKey.create({ data: { ...key, requestHash } }),
      )
      return 'RESERVED'
    } catch (error) {
      // P2002 is the unique violation — exactly the race this exists to lose safely.
      if ((error as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
        return 'ALREADY_EXISTS'
      }
      throw error
    }
  }

  async complete(key: IdempotencyKey, response: unknown): Promise<void> {
    await withScope(platformScope(key.tenantId), (tx) =>
      tx.idempotencyKey.update({
        where: {
          tenantId_source_externalRef: {
            tenantId: key.tenantId,
            source: key.source,
            externalRef: key.externalRef,
          },
        },
        data: { response: response as Prisma.InputJsonValue },
      }),
    )
  }

  async release(key: IdempotencyKey): Promise<void> {
    await withScope(platformScope(key.tenantId), (tx) =>
      tx.idempotencyKey.deleteMany({
        where: { tenantId: key.tenantId, source: key.source, externalRef: key.externalRef },
      }),
    )
  }
}
