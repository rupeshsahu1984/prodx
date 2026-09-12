import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_URL, connect, OWNER_URL, setTenant, TENANT_A } from './helpers'

/**
 * Plant scope (ADR 0003, gap 1) proven at the database.
 *
 * Permissions decide which actions a user may take; scope decides which data
 * they may touch. This suite covers the second, and it runs as prodx_app — the
 * non-owner role the application actually connects as.
 */
const PLANT_A = '01919000-0000-7000-8000-00000000f001'
const PLANT_B = '01919000-0000-7000-8000-00000000f002'
const LEGAL_ENTITY = '01919000-0000-7000-8000-00000000f0e1'

async function setScope(client: Client, scope: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', ['app.plant_scope', scope])
}

describe('plant scope', () => {
  let owner: Client
  let app: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    app = await connect(APP_URL)

    await owner.query(
      `INSERT INTO tenant (id, code, name, updated_at)
       VALUES ($1, 'T-SCOPE', 'Scope Tenant', now()) ON CONFLICT DO NOTHING`,
      [TENANT_A],
    )
    await setTenant(owner, TENANT_A)
    await setScope(owner, '*')
    await owner.query(
      `INSERT INTO legal_entity (id, tenant_id, code, name, base_currency, updated_at)
       VALUES ($1, $2, 'LE-S', 'Scope LE', 'INR', now()) ON CONFLICT DO NOTHING`,
      [LEGAL_ENTITY, TENANT_A],
    )
    for (const [id, code] of [[PLANT_A, 'F-A'], [PLANT_B, 'F-B']] as const) {
      await owner.query(
        `INSERT INTO plant (id, tenant_id, legal_entity_id, code, name, updated_at)
         VALUES ($1, $2, $3, $4, $4, now()) ON CONFLICT DO NOTHING`,
        [id, TENANT_A, LEGAL_ENTITY, code],
      )
      await owner.query(
        `INSERT INTO warehouse (id, tenant_id, plant_id, code, name, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $3, now()) ON CONFLICT DO NOTHING`,
        [TENANT_A, id, `WH-${code}`],
      )
    }
    await setTenant(app, TENANT_A)
  })

  afterAll(async () => {
    await owner.end()
    await app.end()
  })

  it('shows no plants at all when scope is unset', async () => {
    // Fail closed. A code path that forgets to establish scope must see an
    // empty screen, not every factory in the group.
    await setScope(app, '')
    const { rows } = await app.query('SELECT id FROM plant')
    expect(rows).toHaveLength(0)
  })

  it('shows every plant for the explicit all-plants sentinel', async () => {
    await setScope(app, '*')
    const { rows } = await app.query('SELECT id FROM plant ORDER BY code')
    expect(rows.map((r) => r.id)).toEqual([PLANT_A, PLANT_B])
  })

  it('shows only the assigned plant', async () => {
    await setScope(app, PLANT_A)
    const { rows } = await app.query('SELECT id FROM plant')
    expect(rows.map((r) => r.id)).toEqual([PLANT_A])
  })

  it('hides another plant even when queried by its exact id', async () => {
    await setScope(app, PLANT_A)
    const { rows } = await app.query('SELECT id FROM plant WHERE id = $1', [PLANT_B])
    expect(rows).toHaveLength(0)
  })

  it('scopes child records by their plant_id, not only the plant row', async () => {
    await setScope(app, PLANT_A)
    const { rows } = await app.query('SELECT plant_id FROM warehouse')
    expect(rows.map((r) => r.plant_id)).toEqual([PLANT_A])
  })

  it('accepts several plants for a multi-factory user', async () => {
    await setScope(app, `${PLANT_A},${PLANT_B}`)
    const { rows } = await app.query('SELECT id FROM plant')
    expect(rows).toHaveLength(2)
  })

  it('cannot write into a plant outside the scope', async () => {
    await setScope(app, PLANT_A)
    await expect(
      app.query(
        `INSERT INTO warehouse (id, tenant_id, plant_id, code, name, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'SNEAK', 'Sneak', now())`,
        [TENANT_A, PLANT_B],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('still keeps a row with no plant_id visible', async () => {
    // An approval rule with a null plant applies group-wide; scoping must not
    // hide configuration that deliberately spans every factory.
    await setScope(app, PLANT_A)
    await app.query(
      `INSERT INTO approval_rule
         (id, tenant_id, document_type, min_amount, max_amount, plant_id, permission, sequence, updated_at)
       VALUES (gen_random_uuid(), $1, 'SCOPE_TEST', 0, NULL, NULL, 'x:y', 1, now())`,
      [TENANT_A],
    )
    const { rows } = await app.query(
      `SELECT id FROM approval_rule WHERE document_type = 'SCOPE_TEST'`,
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('tenant isolation still applies on top of plant scope', async () => {
    // Scope narrows within a tenant; it can never widen across one.
    await setScope(app, '*')
    await setTenant(app, '01919000-0000-7000-8000-00000000000b')
    const { rows } = await app.query('SELECT id FROM plant WHERE id = $1', [PLANT_A])
    expect(rows).toHaveLength(0)
    await setTenant(app, TENANT_A)
  })
})
