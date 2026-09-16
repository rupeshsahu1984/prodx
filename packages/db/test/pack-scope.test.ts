import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_URL, connect, OWNER_URL, setTenant, TENANT_PACK_SCOPE } from './helpers'

/**
 * Industry pack gating (ADR 0009) proven at the database.
 *
 * The point of doing this in RLS rather than in a service is that disabling a
 * pack hides its data everywhere at once — API, reports, background jobs — with
 * no application check that could be forgotten.
 */
const PLANT = '01919000-0000-7000-8000-00000000e001'
const LEGAL_ENTITY = '01919000-0000-7000-8000-00000000e0e1'

const setScope = async (c: Client, plants: string, packs: string): Promise<void> => {
  await c.query('SELECT set_config($1, $2, false)', ['app.plant_scope', plants])
  await c.query('SELECT set_config($1, $2, false)', ['app.packs', packs])
}

describe('industry pack gating', () => {
  let owner: Client
  let app: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    app = await connect(APP_URL)

    await owner.query(
      `INSERT INTO tenant (id, code, name, updated_at)
       VALUES ($1, 'T-PACK', 'Pack Tenant', now()) ON CONFLICT DO NOTHING`,
      [TENANT_PACK_SCOPE],
    )
    await setTenant(owner, TENANT_PACK_SCOPE)
    await setScope(owner, '*', '*')
    await owner.query(
      `INSERT INTO legal_entity (id, tenant_id, code, name, base_currency, updated_at)
       VALUES ($1, $2, 'LE-P', 'Pack LE', 'INR', now()) ON CONFLICT DO NOTHING`,
      [LEGAL_ENTITY, TENANT_PACK_SCOPE],
    )
    await owner.query(
      `INSERT INTO plant (id, tenant_id, legal_entity_id, code, name, updated_at)
       VALUES ($1, $2, $3, 'F-P', 'F-P', now()) ON CONFLICT DO NOTHING`,
      [PLANT, TENANT_PACK_SCOPE, LEGAL_ENTITY],
    )
    await owner.query(
      `INSERT INTO carton_box_style
         (id, tenant_id, code, name, flute, ply, inner_length_mm, inner_width_mm, inner_height_mm, updated_at)
       VALUES (gen_random_uuid(), $1, 'BOX-TEST', 'Test box', 'BC', 5, 100, 100, 100, now())
       ON CONFLICT DO NOTHING`,
      [TENANT_PACK_SCOPE],
    )
    await setTenant(app, TENANT_PACK_SCOPE)
  })

  afterAll(async () => {
    await owner.end()
    await app.end()
  })

  it('hides pack data when no pack is enabled', async () => {
    // Fail closed, exactly as for tenancy and plant scope.
    await setScope(app, '*', '')
    const { rows } = await app.query('SELECT id FROM carton_box_style')
    expect(rows).toHaveLength(0)
  })

  it('shows pack data when the pack is enabled', async () => {
    await setScope(app, '*', 'carton')
    const { rows } = await app.query('SELECT id FROM carton_box_style')
    expect(rows).toHaveLength(1)
  })

  it('hides one pack while another is enabled', async () => {
    await setScope(app, '*', 'textile')
    const { rows } = await app.query('SELECT id FROM carton_box_style')
    expect(rows).toHaveLength(0)
  })

  it('shows both when both are enabled', async () => {
    await setScope(app, '*', 'carton,textile')
    const { rows } = await app.query('SELECT id FROM carton_box_style')
    expect(rows).toHaveLength(1)
  })

  it('refuses a write into a pack that is not enabled', async () => {
    await setScope(app, '*', 'textile')
    await expect(
      app.query(
        `INSERT INTO carton_box_style
           (id, tenant_id, code, name, flute, ply, inner_length_mm, inner_width_mm, inner_height_mm, updated_at)
         VALUES (gen_random_uuid(), $1, 'SNEAK', 'Sneak', 'B', 3, 10, 10, 10, now())`,
        [TENANT_PACK_SCOPE],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('leaves core tables untouched by pack scope', async () => {
    // The decisive property: uninstalling a pack must not hide inventory,
    // ledger or journal rows, or the books stop reconciling.
    await setScope(app, '*', '')
    const { rows } = await app.query('SELECT id FROM plant WHERE id = $1', [PLANT])
    expect(rows).toHaveLength(1)
  })

  it('still applies tenant isolation on top of pack scope', async () => {
    await setScope(app, '*', 'carton')
    await setTenant(app, '01919000-0000-7000-8000-00000000000b')
    const { rows } = await app.query('SELECT id FROM carton_box_style')
    expect(rows).toHaveLength(0)
    await setTenant(app, TENANT_PACK_SCOPE)
  })

  it('gates every table each pack declares', async () => {
    // Guards against a pack shipping a table that sync-packs never registered,
    // which would leave it readable regardless of installation.
    const { rows } = await owner.query(`
      SELECT pt.table_name
        FROM pack_table pt
        JOIN pg_class c ON c.relname = pt.table_name
        JOIN pg_policy p ON p.polrelid = c.oid
       WHERE pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%app_packs%'`)
    expect(rows).toEqual([])
  })
})
