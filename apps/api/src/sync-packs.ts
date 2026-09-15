/**
 * Copies the pack catalogue from code into pack_table, so the RLS generator can
 * gate pack-owned tables (ADR 0009).
 *
 *   node dist/sync-packs.js
 *
 * Runs as part of database setup, after migrations and before rls.sql. The
 * manifests remain the source of truth; this table is a projection of them.
 */
import { prisma } from '@prodx/db'
import { packRegistry } from './packs/registry'

async function main(): Promise<void> {
  const rows = packRegistry.all().flatMap((pack) =>
    pack.tables.map((tableName) => ({ packId: pack.id, tableName })),
  )

  const present = new Set(rows.map((r) => r.tableName))
  // Remove tables a pack no longer owns, so a renamed table cannot stay gated
  // by a pack that has forgotten it.
  await prisma.packTable.deleteMany({ where: { tableName: { notIn: [...present] } } })

  for (const row of rows) {
    await prisma.packTable.upsert({
      where: { tableName: row.tableName },
      create: row,
      update: { packId: row.packId },
    })
  }

  const missing: string[] = []
  for (const row of rows) {
    const found = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ${row.tableName}
      ) AS exists`
    if (found[0]?.exists !== true) missing.push(row.tableName)
  }
  if (missing.length > 0) {
    // A manifest naming a table that does not exist would silently gate nothing.
    throw new Error(
      `Manifest declares tables that are not in the database: ${missing.join(', ')}. ` +
        'Run prisma migrate deploy first.',
    )
  }

  // eslint-disable-next-line no-console
  console.log(`  pack catalogue synced: ${packRegistry.all().length} packs, ${rows.length} tables`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
