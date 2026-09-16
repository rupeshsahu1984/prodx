import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_URL, connect, OWNER_URL, setTenant, TENANT_A, WORKER_URL } from './helpers'

/**
 * The outbox worker's cross-tenant role (ADR 0002).
 *
 * This exists because of a real bug: the worker connected as the application
 * role with no tenant context, saw nothing under RLS, and silently delivered
 * nothing at all. Background jobs are where isolation breaks, and it broke in
 * the direction nobody watches for — the job seeing too little rather than too
 * much.
 *
 * These tests pin both halves: the worker role can find work across tenants,
 * and the application role still cannot.
 */
describe('worker role', () => {
  let owner: Client
  let app: Client
  let worker: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
    app = await connect(APP_URL)
    worker = await connect(WORKER_URL)

    await owner.query(
      `INSERT INTO tenant (id, code, name, updated_at)
       VALUES ($1, 'T-WORKER', 'Worker Tenant', now()) ON CONFLICT DO NOTHING`,
      [TENANT_A],
    )
    await setTenant(owner, TENANT_A)
    await owner.query("SELECT set_config('app.plant_scope', '*', false)")
    await owner.query("SELECT set_config('app.packs', '*', false)")
    await owner.query("SELECT set_config('app.departments', '*', false)")
    await owner.query(
      `INSERT INTO outbox_message (id, tenant_id, topic, payload)
       VALUES (gen_random_uuid(), $1, 'worker.test', '{}'::jsonb)`,
      [TENANT_A],
    )
  })

  afterAll(async () => {
    await owner.end()
    await app.end()
    await worker.end()
  })

  it('finds pending work with no tenant context', async () => {
    const { rows } = await worker.query(
      "SELECT id FROM outbox_message WHERE topic = 'worker.test'",
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('the application role sees nothing without context', async () => {
    // The bug this suite exists for: with prodx_app the worker delivered
    // nothing and reported no error, because an empty result is not an error.
    const { rows } = await app.query("SELECT id FROM outbox_message WHERE topic = 'worker.test'")
    expect(rows).toHaveLength(0)
  })

  it('even the owner sees nothing without context, because tables are FORCEd', async () => {
    const fresh = await connect(OWNER_URL)
    try {
      const { rows } = await fresh.query(
        "SELECT id FROM outbox_message WHERE topic = 'worker.test'",
      )
      expect(rows).toHaveLength(0)
    } finally {
      await fresh.end()
    }
  })

  it('has BYPASSRLS, and no other login role does', async () => {
    // Pins the blast radius: exactly one role may cross tenants.
    const { rows } = await owner.query(
      `SELECT rolname FROM pg_roles WHERE rolbypassrls AND rolcanlogin
         AND rolname LIKE 'prodx%' ORDER BY rolname`,
    )
    expect(rows.map((r) => r.rolname)).toEqual(['prodx_worker'])
  })
})
