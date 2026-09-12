import { Client } from 'pg'

const URL =
  process.env['TEST_APP_DATABASE_URL'] ??
  'postgresql://prodx_app:prodx_test_pw@localhost:5432/prodx_test'

/** Fails loudly rather than skipping. A security test that does not run reports success. */
export default async function setup(): Promise<void> {
  const client = new Client({ connectionString: URL, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    await client.end()
  } catch (error) {
    throw new Error(
      'Integration tests need a prepared PostgreSQL database.\n\n' +
        '  brew services start postgresql@16\n' +
        '  packages/db/scripts/setup-test-db.sh\n\n' +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
