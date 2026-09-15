import { UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { beforeAll, describe, expect, it } from 'vitest'
import { currentContext } from '../tenancy/tenant-context'
import { AuthMiddleware } from './auth.middleware'
import { JwtService } from './jwt.service'

const SECRET = 'a-test-secret-that-is-definitely-long-enough'
const TENANT = '01919000-0000-7000-8000-00000000bbbb'
const USER = '01919000-0000-7000-8000-00000000aaaa'

const req = (authorization?: string): Request =>
  ({ header: (name: string) => (name === 'authorization' ? authorization : undefined) }) as Request

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware

  beforeAll(() => {
    process.env['JWT_SECRET'] = SECRET
    middleware = new AuthMiddleware(new JwtService())
  })

  const signed = (claims: Record<string, unknown>): string =>
    jwt.sign({ sa: false, plants: [], depts: [], packs: [], ...claims }, SECRET, {
      algorithm: 'HS256',
      expiresIn: 60,
    })

  it('establishes context from the signed claims', () => {
    let seen: ReturnType<typeof currentContext> | undefined
    middleware.use(
      req(`Bearer ${signed({ sub: USER, tid: TENANT, perms: ['item:read'] })}`),
      {} as Response,
      () => {
        seen = currentContext()
      },
    )
    expect(seen).toMatchObject({ tenantId: TENANT, userId: USER, permissions: ['item:read'] })
  })

  it('ignores a tenant supplied by header — only the claim counts', () => {
    // The whole point of replacing the Phase 0 stub. An attacker controls
    // headers; they do not control the signature.
    const attacker = '01919000-0000-7000-8000-00000000dead'
    const request = {
      header: (name: string) =>
        name === 'authorization'
          ? `Bearer ${signed({ sub: USER, tid: TENANT, perms: [] })}`
          : name === 'x-tenant-id'
            ? attacker
            : undefined,
    } as Request

    let seenTenant = ''
    middleware.use(request, {} as Response, () => {
      seenTenant = currentContext().tenantId
    })
    expect(seenTenant).toBe(TENANT)
    expect(seenTenant).not.toBe(attacker)
  })

  it('rejects a missing or malformed Authorization header', () => {
    for (const header of [undefined, '', 'Bearer', 'Basic abc', 'Bearer ']) {
      expect(() => middleware.use(req(header), {} as Response, () => undefined)).toThrow(
        UnauthorizedException,
      )
    }
  })

  it('accepts the scheme case-insensitively', () => {
    expect(() =>
      middleware.use(
        req(`bearer ${signed({ sub: USER, tid: TENANT, perms: [] })}`),
        {} as Response,
        () => undefined,
      ),
    ).not.toThrow()
  })

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign(
      { sub: USER, tid: TENANT, perms: ['*'], sa: false, plants: [], depts: [], packs: [] },
      'attacker-secret-long-enough',
    )
    expect(() => middleware.use(req(`Bearer ${forged}`), {} as Response, () => undefined)).toThrow(
      UnauthorizedException,
    )
  })

  it('does not call next when the token is invalid', () => {
    let called = false
    expect(() =>
      middleware.use(req('Bearer nonsense'), {} as Response, () => {
        called = true
      }),
    ).toThrow()
    expect(called).toBe(false)
  })
})
