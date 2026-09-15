import { PrismaClient, type Prisma } from '@prisma/client'

export const prisma = new PrismaClient()

/**
 * Which factories the caller may touch.
 *
 * `ALL_PLANTS` is the explicit sentinel for a tenant superadmin and for platform
 * paths such as seeding. It is deliberately not a default: the scope is a
 * required argument everywhere, so the only way to see every plant is to say so.
 */
export const ALL_PLANTS = '*' as const
export const ALL_PACKS = '*' as const

export type PlantScope = typeof ALL_PLANTS | readonly string[]
export type PackScope = typeof ALL_PACKS | readonly string[]

/**
 * Everything the database needs to decide what this caller may see.
 *
 * One object rather than a growing list of positional arguments: tenancy came
 * first, then plants, then packs, and a fourth dimension would have made every
 * call site unreadable. Each field is required, so a new dimension is a compile
 * error at every call site rather than a silent default.
 */
export interface DbScope {
  tenantId: string
  /** Factories (ADR 0003). ALL_PLANTS only for superadmins and platform paths. */
  plants: PlantScope
  /** Installed industry packs (ADR 0009). ALL_PACKS only for platform paths. */
  packs: PackScope
}

const serialize = (scope: PlantScope | PackScope): string =>
  typeof scope === 'string' ? scope : scope.join(',')

/**
 * Returns a Prisma client scoped to one tenant (ADR 0002).
 *
 * Every operation is wrapped in a transaction that first sets `app.tenant_id`,
 * which the RLS policies read. Three things make this correct, and all three are
 * easy to get wrong:
 *
 *  1. `set_config(..., true)` is *transaction-local*. Setting it outside a
 *     transaction leaves it on a pooled connection that another tenant may be
 *     handed next — under PgBouncer transaction pooling that is a cross-tenant leak.
 *  2. The application must connect as a NON-OWNER role. A table's owner bypasses
 *     RLS unless the table is also FORCEd, which `scripts/rls.sql` does as a
 *     second line of defence.
 *  3. Nothing outside the request path gets this for free. Jobs, migrations and
 *     report queries must establish tenant context explicitly.
 */
export function forScope(scope: DbScope) {
  const plants = serialize(scope.plants)
  const packs = serialize(scope.packs)
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, , , result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId}::text, true)`,
            prisma.$executeRaw`SELECT set_config('app.plant_scope', ${plants}, true)`,
            prisma.$executeRaw`SELECT set_config('app.packs', ${packs}, true)`,
            query(args),
          ])
          return result
        },
      },
    },
  })
}

export type TenantClient = ReturnType<typeof forScope>

/**
 * Runs a multi-statement business operation inside ONE transaction, with the
 * tenant set once for its duration.
 *
 * `forTenant` above wraps each operation in its own transaction, which is right
 * for a single read but wrong for anything that must be atomic: a goods receipt
 * posts stock, updates valuation, writes a journal and updates the purchase
 * order, and either all of that happens or none of it does.
 *
 * Use this for every write path. Use `forTenant` for reads.
 *
 * Nothing external may be called inside `fn` — no HTTP, no queue publish, no
 * file upload. Emit an outbox row instead and let a worker deliver it: holding
 * a transaction open across a network call also holds the number-series row
 * lock, which serialises every other document in that series (ADR 0008).
 */
export async function withScope<T>(
  scope: DbScope,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const plants = serialize(scope.plants)
  const packs = serialize(scope.packs)
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId}::text, true)`
      await tx.$executeRaw`SELECT set_config('app.plant_scope', ${plants}, true)`
      await tx.$executeRaw`SELECT set_config('app.packs', ${packs}, true)`
      return fn(tx)
    },
    { timeout: options?.timeoutMs ?? 15_000 },
  )
}

/** Platform paths: migrations, seeding, tenant provisioning, outbox delivery. */
export const platformScope = (tenantId: string): DbScope => ({
  tenantId,
  plants: ALL_PLANTS,
  packs: ALL_PACKS,
})
