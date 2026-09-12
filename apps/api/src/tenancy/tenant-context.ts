import type { PlantScope } from '@prodx/db'
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  tenantId: string
  userId: string
  permissions: readonly string[]
  /**
   * Which factories this request may touch. Permissions say what the user may
   * DO; this says what they may do it TO. A plant head and a group buyer can
   * hold identical permissions and still see different data.
   */
  plantScope: PlantScope
  departmentIds: readonly string[]
}

const storage = new AsyncLocalStorage<RequestContext>()

export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn)

/**
 * Throws rather than returning null. A missing context is a programming error,
 * and the safe failure is to refuse the request — never to fall back to an
 * unscoped client (ADR 0002).
 */
export function currentContext(): RequestContext {
  const context = storage.getStore()
  if (context === undefined) {
    throw new Error('No request context. This route did not pass through AuthMiddleware.')
  }
  return context
}

export const currentTenantId = (): string => currentContext().tenantId
export const currentScope = (): PlantScope => currentContext().plantScope
