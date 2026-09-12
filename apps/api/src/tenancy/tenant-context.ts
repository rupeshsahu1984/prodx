import { AsyncLocalStorage } from 'node:async_hooks'

export interface TenantContext {
  tenantId: string
  userId: string | null
}

const storage = new AsyncLocalStorage<TenantContext>()

export const runWithTenant = <T>(context: TenantContext, fn: () => T): T =>
  storage.run(context, fn)

/**
 * Throws rather than returning null. A missing tenant context is a programming
 * error, and the safe failure is to refuse the request — never to fall back to
 * an unscoped client (ADR 0002).
 */
export function currentTenant(): TenantContext {
  const context = storage.getStore()
  if (context === undefined) {
    throw new Error('No tenant context. Request did not pass through TenantMiddleware.')
  }
  return context
}
