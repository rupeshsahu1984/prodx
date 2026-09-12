import { PrismaClient, type Prisma } from '@prisma/client'

export const prisma = new PrismaClient()

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
export function forTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`,
            query(args),
          ])
          return result
        },
      },
    },
  })
}

export type TenantClient = ReturnType<typeof forTenant>

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
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`
      return fn(tx)
    },
    { timeout: options?.timeoutMs ?? 15_000 },
  )
}
