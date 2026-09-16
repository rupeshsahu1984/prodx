import { Client } from 'pg'

export const OWNER_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://prodx_owner:prodx_test_pw@localhost:5432/prodx_test'

export const APP_URL =
  process.env['TEST_APP_DATABASE_URL'] ??
  'postgresql://prodx_app:prodx_test_pw@localhost:5432/prodx_test'

export async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url })
  await client.connect()
  return client
}

/** Sets the tenant the way a request would, for the life of this connection. */
export async function setTenant(client: Client, tenantId: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', tenantId])
}

/** Resets the setting to unset — the state a connection starts in. */
export async function clearTenant(client: Client): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', NULL, false)")
}

export const TENANT_A = '01919000-0000-7000-8000-00000000000a'
export const TENANT_B = '01919000-0000-7000-8000-00000000000b'

/**
 * Suites that create their own plants and documents get their own tenant.
 * Sharing TENANT_A once meant a fixture added by a new suite silently changed
 * what an older suite counted — the tests were coupled through data, which is
 * the least obvious kind of coupling to debug.
 */
export const TENANT_PLANT_SCOPE = '01919000-0000-7000-8000-0000000000f1'
export const TENANT_PACK_SCOPE = '01919000-0000-7000-8000-0000000000f2'
export const TENANT_DEPT_SCOPE = '01919000-0000-7000-8000-0000000000f3'

/**
 * Two tenants, each with one item.
 *
 * Note the setTenant call inside the loop: FORCE ROW LEVEL SECURITY means even
 * the owning role cannot insert without a tenant context. That is the policy
 * working, and seeding has to respect it like everything else.
 */
export async function seedTwoTenants(owner: Client): Promise<void> {
  for (const [tenantId, suffix] of [
    [TENANT_A, 'a'],
    [TENANT_B, 'b'],
  ] as const) {
    await setTenant(owner, tenantId)
    await owner.query(
      `INSERT INTO tenant (id, code, name, updated_at)
       VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
      [tenantId, `T-${suffix}`, `Tenant ${suffix}`],
    )
    await owner.query(
      `INSERT INTO uom (id, tenant_id, code, name, dimension, updated_at)
       VALUES ($1, $2, 'MTR', 'Metre', 'LENGTH', now()) ON CONFLICT DO NOTHING`,
      [`01919000-0000-7000-8000-0000000000${suffix}1`, tenantId],
    )
    await owner.query(
      `INSERT INTO item (id, tenant_id, code, name, base_uom_id, granularity, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'LOT', now()) ON CONFLICT DO NOTHING`,
      [
        `01919000-0000-7000-8000-0000000000${suffix}2`,
        tenantId,
        `ITEM-${suffix}`,
        `Item ${suffix}`,
        `01919000-0000-7000-8000-0000000000${suffix}1`,
      ],
    )
  }
}

export const ITEM_A_ID = '01919000-0000-7000-8000-0000000000a2'
export const ITEM_B_ID = '01919000-0000-7000-8000-0000000000b2'
