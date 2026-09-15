import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  APP_URL,
  clearTenant,
  connect,
  ITEM_A_ID,
  ITEM_B_ID,
  OWNER_URL,
  seedTwoTenants,
  setTenant,
  TENANT_A,
  TENANT_B,
} from './helpers'

/**
 * These are the tests that turn ADR 0002 from a claim into a fact.
 *
 * Everything here runs as prodx_app — the non-owner role the application
 * actually connects as. Passing as the owner would prove nothing.
 */
describe('tenant isolation (RLS)', () => {
  let owner: Client
  let app: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    app = await connect(APP_URL)
    // These tables carry no plant_id; the sentinel keeps plant scope out of the way
    // so this suite tests tenant isolation on its own.
    await owner.query("SELECT set_config('app.plant_scope', '*', false)")
    await owner.query("SELECT set_config('app.packs', '*', false)")
    await app.query("SELECT set_config('app.plant_scope', '*', false)")
    await app.query("SELECT set_config('app.packs', '*', false)")
    await seedTwoTenants(owner)
  })

  afterAll(async () => {
    await owner.end()
    await app.end()
  })

  it('shows nothing at all on a connection that never set a tenant', async () => {
    // The single most important assertion in the suite, and deliberately run on
    // a FRESH connection: that is exactly the real failure mode — a code path
    // that forgot to establish context. It must yield an empty result, never
    // the whole table.
    const virgin = await connect(APP_URL)
    try {
      const { rows } = await virgin.query('SELECT id FROM item')
      expect(rows).toHaveLength(0)
    } finally {
      await virgin.end()
    }
  })

  it('shows nothing when the tenant is explicitly cleared', async () => {
    await clearTenant(app)
    const { rows } = await app.query('SELECT id FROM item')
    expect(rows).toHaveLength(0)
  })

  it('shows only the current tenant rows', async () => {
    await setTenant(app, TENANT_A)
    const { rows } = await app.query('SELECT id FROM item')
    expect(rows.map((r) => r.id)).toEqual([ITEM_A_ID])
  })

  it('cannot read another tenant row even by its exact id', async () => {
    // This is the IDOR case: the attacker already knows the id.
    await setTenant(app, TENANT_A)
    const { rows } = await app.query('SELECT id FROM item WHERE id = $1', [ITEM_B_ID])
    expect(rows).toHaveLength(0)
  })

  it('cannot update another tenant row', async () => {
    await setTenant(app, TENANT_A)
    const result = await app.query('UPDATE item SET name = $1 WHERE id = $2', ['hacked', ITEM_B_ID])
    expect(result.rowCount).toBe(0)

    await setTenant(app, TENANT_B)
    const { rows } = await app.query('SELECT name FROM item WHERE id = $1', [ITEM_B_ID])
    expect(rows[0]?.name).toBe('Item b')
  })

  it('cannot delete another tenant row', async () => {
    await setTenant(app, TENANT_A)
    const result = await app.query('DELETE FROM item WHERE id = $1', [ITEM_B_ID])
    expect(result.rowCount).toBe(0)
  })

  it('cannot insert a row belonging to another tenant', async () => {
    // WITH CHECK, not just USING. Without it a tenant could write into another
    // tenant's data even though it cannot read it back.
    await setTenant(app, TENANT_A)
    await expect(
      app.query(
        `INSERT INTO uom (id, tenant_id, code, name, dimension, updated_at)
         VALUES (gen_random_uuid(), $1, 'KGM', 'Kilogram', 'MASS', now())`,
        [TENANT_B],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('applies to every table that carries tenant_id', async () => {
    // Guards against a future table shipping without a policy.
    const { rows } = await owner.query(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND a.attname = 'tenant_id' AND NOT a.attisdropped
         AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
              OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 0)
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })
})
