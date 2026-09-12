import { Client } from 'pg'
import { OWNER_URL } from './helpers'

/**
 * Fails with an actionable message rather than a connection stack trace.
 *
 * Deliberately does NOT skip when the database is missing. These are the tests
 * that prove tenant isolation; a suite that quietly passes without running them
 * is the same vacuous-success failure that once let RLS ship applied to zero
 * tables.
 */
export default async function setup(): Promise<void> {
  const client = new Client({ connectionString: OWNER_URL, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    const { rows } = await client.query(`
      SELECT count(*)::int AS n FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_policy  p ON p.polrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'`)
    const policies = rows[0]?.n ?? 0
    if (policies < 15) {
      throw new Error(
        `Test database has only ${policies} tenant policies. Run ./scripts/setup-test-db.sh`,
      )
    }
    await client.end()
  } catch (error) {
    throw new Error(
      'Integration tests need a prepared PostgreSQL database.\n\n' +
        '  brew services start postgresql@16\n' +
        '  packages/db/scripts/setup-test-db.sh\n\n' +
        `Tried ${OWNER_URL.replace(/:[^:@]*@/, ':***@')}\n` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
