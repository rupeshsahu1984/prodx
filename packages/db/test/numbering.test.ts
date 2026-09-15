import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, OWNER_URL, seedTwoTenants, setTenant, TENANT_A } from './helpers'

const LEGAL_ENTITY_ID = '01919000-0000-7000-8000-0000000000c1'
const SERIES = 'SALES_INVOICE'
const FY = '2026-27'

async function allocate(client: Client): Promise<number> {
  const { rows } = await client.query<{ value: string }>(
    `UPDATE number_series SET next_value = next_value + 1
      WHERE tenant_id = $1 AND legal_entity_id = $2 AND series_code = $3 AND fiscal_year = $4
     RETURNING next_value - 1 AS value`,
    [TENANT_A, LEGAL_ENTITY_ID, SERIES, FY],
  )
  return Number(rows[0]?.value)
}

/**
 * ADR 0008 claims the numbering is gapless under concurrency and that a
 * rolled-back document returns its number. Both are properties of the row lock,
 * so both need a real database to demonstrate.
 */
describe('gapless document numbering', () => {
  let owner: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    await owner.query("SELECT set_config('app.plant_scope', '*', false)")
    await owner.query("SELECT set_config('app.packs', '*', false)")
    await seedTwoTenants(owner)
    await setTenant(owner, TENANT_A)
    await owner.query(
      `INSERT INTO legal_entity (id, tenant_id, code, name, base_currency, updated_at)
       VALUES ($1, $2, 'LE-A', 'Legal Entity A', 'INR', now()) ON CONFLICT DO NOTHING`,
      [LEGAL_ENTITY_ID, TENANT_A],
    )
    await owner.query(
      `INSERT INTO number_series
         (id, tenant_id, legal_entity_id, series_code, fiscal_year, format, next_value, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'INV/{FY}/{####}', 1, now())
       ON CONFLICT (tenant_id, legal_entity_id, series_code, fiscal_year)
       DO UPDATE SET next_value = 1`,
      [TENANT_A, LEGAL_ENTITY_ID, SERIES, FY],
    )
  })

  afterAll(async () => {
    await owner.end()
  })

  it('allocates distinct, contiguous numbers under concurrency', async () => {
    const CONCURRENCY = 25
    const clients = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const c = await connect(OWNER_URL)
        await c.query("SELECT set_config('app.plant_scope', '*', false)")
        await c.query("SELECT set_config('app.packs', '*', false)")
        await setTenant(c, TENANT_A)
        return c
      }),
    )
    try {
      const values = await Promise.all(clients.map((c) => allocate(c)))
      const sorted = [...values].sort((a, b) => a - b)

      expect(new Set(values).size).toBe(CONCURRENCY)
      // MAX(number)+1 would duplicate here; a sequence would leave holes.
      expect(sorted).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => sorted[0]! + i))
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  })

  it('returns the number when the document rolls back', async () => {
    const a = await connect(OWNER_URL)
    const b = await connect(OWNER_URL)
    try {
      for (const c of [a, b]) {
        await c.query("SELECT set_config('app.plant_scope', '*', false)")
        await c.query("SELECT set_config('app.packs', '*', false)")
        await setTenant(c, TENANT_A)
      }
      await a.query('BEGIN')
      const abandoned = await allocate(a)
      await a.query('ROLLBACK')

      const reused = await allocate(b)
      // This is the whole reason a Postgres SEQUENCE is wrong for statutory
      // series: it would have burned `abandoned` permanently.
      expect(reused).toBe(abandoned)
    } finally {
      await a.end()
      await b.end()
    }
  })
})
