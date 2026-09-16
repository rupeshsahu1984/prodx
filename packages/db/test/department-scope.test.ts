import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_URL, connect, OWNER_URL, setTenant, TENANT_DEPT_SCOPE } from './helpers'

/**
 * Department scope, the third narrowing after tenant and plant (ADR 0003).
 *
 * The asymmetry worth stating: an empty department scope means NOTHING, exactly
 * like an empty plant scope. "No assignments means every department" is a
 * decision the auth layer makes by sending the explicit '*' — not something the
 * database infers from an empty setting, which would be a fail-open.
 */
const PLANT = '01919000-0000-7000-8000-00000000d001'
const LEGAL_ENTITY = '01919000-0000-7000-8000-00000000d0e1'
const DEPT_STORES = '01919000-0000-7000-8000-00000000dd01'
const DEPT_PURCHASE = '01919000-0000-7000-8000-00000000dd02'
const SUPPLIER = '01919000-0000-7000-8000-00000000dd99'

async function scope(c: Client, plants: string, departments: string): Promise<void> {
  await c.query('SELECT set_config($1, $2, false)', ['app.plant_scope', plants])
  await c.query('SELECT set_config($1, $2, false)', ['app.packs', '*'])
  await c.query('SELECT set_config($1, $2, false)', ['app.departments', departments])
}

describe('department scope', () => {
  let owner: Client
  let app: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    app = await connect(APP_URL)
    await owner.query(
      `INSERT INTO tenant (id, code, name, updated_at)
       VALUES ($1, 'T-DEPT', 'Dept Tenant', now()) ON CONFLICT DO NOTHING`,
      [TENANT_DEPT_SCOPE],
    )
    await setTenant(owner, TENANT_DEPT_SCOPE)
    await scope(owner, '*', '*')

    await owner.query(
      `INSERT INTO legal_entity (id, tenant_id, code, name, base_currency, updated_at)
       VALUES ($1, $2, 'LE-D', 'Dept LE', 'INR', now()) ON CONFLICT DO NOTHING`,
      [LEGAL_ENTITY, TENANT_DEPT_SCOPE],
    )
    await owner.query(
      `INSERT INTO plant (id, tenant_id, legal_entity_id, code, name, updated_at)
       VALUES ($1, $2, $3, 'F-D', 'F-D', now()) ON CONFLICT DO NOTHING`,
      [PLANT, TENANT_DEPT_SCOPE, LEGAL_ENTITY],
    )
    for (const [id, code] of [[DEPT_STORES, 'STORES'], [DEPT_PURCHASE, 'PURCHASE']] as const) {
      await owner.query(
        `INSERT INTO department (id, tenant_id, plant_id, code, name, updated_at)
         VALUES ($1, $2, $3, $4, $4, now()) ON CONFLICT DO NOTHING`,
        [id, TENANT_DEPT_SCOPE, PLANT, code],
      )
    }
    await owner.query(
      `INSERT INTO party (id, tenant_id, code, name, type, updated_at)
       VALUES ($1, $2, 'SUP-D', 'Supplier', 'SUPPLIER', now()) ON CONFLICT DO NOTHING`,
      [SUPPLIER, TENANT_DEPT_SCOPE],
    )

    const order = async (no: string, departmentId: string | null): Promise<void> => {
      await owner.query(
        `INSERT INTO purchase_order
           (id, tenant_id, legal_entity_id, plant_id, document_no, supplier_id, state,
            order_date, total_amount, department_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'DRAFT', now(), 0, $6, now())
         ON CONFLICT DO NOTHING`,
        [TENANT_DEPT_SCOPE, LEGAL_ENTITY, PLANT, no, SUPPLIER, departmentId],
      )
    }
    await order('PO-STORES', DEPT_STORES)
    await order('PO-PURCHASE', DEPT_PURCHASE)
    await order('PO-PLANTWIDE', null)

    await setTenant(app, TENANT_DEPT_SCOPE)
  })

  afterAll(async () => {
    await owner.end()
    await app.end()
  })

  const numbers = async (): Promise<string[]> => {
    const { rows } = await app.query('SELECT document_no FROM purchase_order ORDER BY document_no')
    return rows.map((r) => r.document_no)
  }

  it('shows every order for the explicit all-departments sentinel', async () => {
    await scope(app, PLANT, '*')
    expect(await numbers()).toEqual(['PO-PLANTWIDE', 'PO-PURCHASE', 'PO-STORES'])
  })

  it('shows only the assigned department, plus plant-wide documents', async () => {
    // A document with no department belongs to the plant as a whole; hiding it
    // would make ordinary plant business invisible to everyone with a department.
    await scope(app, PLANT, DEPT_STORES)
    expect(await numbers()).toEqual(['PO-PLANTWIDE', 'PO-STORES'])
  })

  it('hides another department even by exact document number', async () => {
    await scope(app, PLANT, DEPT_STORES)
    const { rows } = await app.query(
      'SELECT id FROM purchase_order WHERE document_no = $1',
      ['PO-PURCHASE'],
    )
    expect(rows).toHaveLength(0)
  })

  it('shows nothing department-owned when the scope is empty', async () => {
    // Fails closed like the others. "No assignments means all" is resolved in
    // the auth layer by sending '*', never inferred from an empty setting.
    await scope(app, PLANT, '')
    expect(await numbers()).toEqual(['PO-PLANTWIDE'])
  })

  it('accepts several departments', async () => {
    await scope(app, PLANT, `${DEPT_STORES},${DEPT_PURCHASE}`)
    expect(await numbers()).toEqual(['PO-PLANTWIDE', 'PO-PURCHASE', 'PO-STORES'])
  })

  it('cannot write into a department outside the scope', async () => {
    await scope(app, PLANT, DEPT_STORES)
    await expect(
      app.query(
        `INSERT INTO purchase_order
           (id, tenant_id, legal_entity_id, plant_id, document_no, supplier_id, state,
            order_date, total_amount, department_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'PO-SNEAK', $4, 'DRAFT', now(), 0, $5, now())`,
        [TENANT_DEPT_SCOPE, LEGAL_ENTITY, PLANT, SUPPLIER, DEPT_PURCHASE],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('still applies plant scope on top of department scope', async () => {
    // Department narrows within plants; it can never widen past one.
    await scope(app, '', '*')
    expect(await numbers()).toEqual([])
  })

  it('leaves tables without a department column alone', async () => {
    await scope(app, PLANT, DEPT_STORES)
    const { rows } = await app.query('SELECT id FROM plant WHERE id = $1', [PLANT])
    expect(rows).toHaveLength(1)
  })
})
