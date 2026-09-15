import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ExecutionContext } from '@nestjs/common'
import { ALL_PLANTS } from '@prodx/db'
import { describe, expect, it } from 'vitest'
import { runWithContext } from '../tenancy/tenant-context'
import {
  ANY_AUTHENTICATED_KEY,
  IS_PUBLIC_KEY,
  PERMISSION_KEY,
  PermissionsGuard,
  REQUIRES_PACK_KEY,
} from './permissions.guard'

/** Minimal ExecutionContext — the guard only ever asks for handler and class. */
const ctx = (): ExecutionContext =>
  ({ getHandler: () => () => undefined, getClass: () => class {} }) as unknown as ExecutionContext

function guardWith(metadata: Record<string, unknown>): PermissionsGuard {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector
  return new PermissionsGuard(reflector)
}

const withPerms = <T>(permissions: string[], fn: () => T, packs: string[] = []): T =>
  runWithContext(
    {
      tenantId: 't', userId: 'u', permissions,
      plantScope: ALL_PLANTS, departmentIds: [], packScope: packs,
    },
    fn,
  )

describe('PermissionsGuard', () => {
  it('denies a route that declares no permission', () => {
    // The important one. If an undecorated route were allowed, a forgotten
    // decorator would silently publish an endpoint.
    const guard = guardWith({})
    expect(() => withPerms(['*'], () => guard.canActivate(ctx()))).toThrow(ForbiddenException)
  })

  it('allows an explicitly public route without any context', () => {
    const guard = guardWith({ [IS_PUBLIC_KEY]: true })
    expect(guard.canActivate(ctx())).toBe(true)
  })

  it('allows when the permission is held', () => {
    const guard = guardWith({ [PERMISSION_KEY]: 'purchase_order:approve' })
    expect(withPerms(['purchase_order:approve'], () => guard.canActivate(ctx()))).toBe(true)
  })

  it('allows via a domain wildcard', () => {
    const guard = guardWith({ [PERMISSION_KEY]: 'purchase_order:approve' })
    expect(withPerms(['purchase_order:*'], () => guard.canActivate(ctx()))).toBe(true)
  })

  it('denies when the permission is missing', () => {
    const guard = guardWith({ [PERMISSION_KEY]: 'purchase_order:approve' })
    expect(() => withPerms(['purchase_order:read'], () => guard.canActivate(ctx()))).toThrow(
      ForbiddenException,
    )
  })

  it('lets an authenticated caller through without a specific permission', () => {
    // A route that only returns the caller's own context must not have to ask
    // for `*` — granting that to read a profile would grant everything else too.
    const guard = guardWith({ [ANY_AUTHENTICATED_KEY]: true })
    expect(withPerms([], () => guard.canActivate(ctx()))).toBe(true)
  })

  it('still requires a token for an any-authenticated route', () => {
    const guard = guardWith({ [ANY_AUTHENTICATED_KEY]: true })
    expect(() => guard.canActivate(ctx())).toThrow(/No request context/)
  })

  it('refuses a pack route when the pack is not installed', () => {
    const guard = guardWith({ [REQUIRES_PACK_KEY]: 'textile', [PERMISSION_KEY]: 'textile_yarn:read' })
    expect(() => withPerms(['*'], () => guard.canActivate(ctx()), ['carton'])).toThrow(
      /textile industry pack is not installed/,
    )
  })

  it('allows a pack route when the pack is installed and the permission held', () => {
    const guard = guardWith({ [REQUIRES_PACK_KEY]: 'textile', [PERMISSION_KEY]: 'textile_yarn:read' })
    expect(withPerms(['textile_yarn:read'], () => guard.canActivate(ctx()), ['textile'])).toBe(true)
  })

  it('checks the pack before the permission, so the clearer error wins', () => {
    // "Pack not installed" is actionable; "missing permission" would send an
    // operator looking for a role that does not exist yet.
    const guard = guardWith({ [REQUIRES_PACK_KEY]: 'textile', [PERMISSION_KEY]: 'textile_yarn:read' })
    expect(() => withPerms([], () => guard.canActivate(ctx()), [])).toThrow(/not installed/)
  })

  it('throws rather than defaulting when there is no request context', () => {
    const guard = guardWith({ [PERMISSION_KEY]: 'purchase_order:read' })
    expect(() => guard.canActivate(ctx())).toThrow(/No request context/)
  })
})
