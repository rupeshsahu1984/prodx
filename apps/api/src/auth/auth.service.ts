import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { LoginRequest, TokenPair } from '@prodx/contracts'
import { hashPassword, needsRehash, verifyPassword } from '@prodx/core'
import { ALL_PLANTS, prisma, withTenantTransaction } from '@prodx/db'
import { createHash, randomBytes } from 'node:crypto'
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service'

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000

/** Stored hashed: a database read must not yield a usable credential. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Extracts the routing hint from `<tenantId>.<secret>`; null if malformed. */
function tenantIdFromToken(token: string): string | null {
  const tenantId = token.split('.', 1)[0] ?? ''
  return UUID.test(tenantId) ? tenantId : null
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Login is the one flow that must resolve a tenant before it has one.
   *
   * Only the `tenant` table itself is readable without context — it carries no
   * tenant_id, so it has no policy. Everything after that runs INSIDE the
   * resolved tenant's context, so RLS applies to the user lookup exactly as it
   * does to every other read. Reading app_user on the unscoped client would
   * simply return nothing, which is the policy doing its job.
   */
  async login(request: LoginRequest): Promise<TokenPair> {
    const tenant = await prisma.tenant.findUnique({ where: { code: request.tenantCode } })

    const user =
      tenant === null || !tenant.isActive
        ? null
        : await withTenantTransaction(tenant.id, ALL_PLANTS, (tx) =>
            // Identity tables carry no plant_id, so plant scope does not apply
            // here — this is where the user's own scope is being discovered.
            tx.appUser.findUnique({
              where: { tenantId_email: { tenantId: tenant.id, email: request.email.toLowerCase() } },
              include: {
                roles: { include: { role: true } },
                plantAccess: true,
                deptAccess: true,
              },
            }),
          )

    // One message for every failure. Distinguishing "no such tenant" from "no
    // such user" from "wrong password" enumerates accounts.
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect tenant, email or password.',
    })

    if (user === null || !user.isActive) {
      // Hash anyway so a missing user is not measurably faster than a wrong password.
      await verifyPassword(request.password, 'scrypt$131072$8$1$c2FsdA==$aGFzaA==')
      throw invalid
    }

    if (user.lockedUntil !== null && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Try again later.',
      })
    }

    if (!(await verifyPassword(request.password, user.passwordHash))) {
      const attempts = user.failedLoginAttempts + 1
      await withTenantTransaction(user.tenantId, ALL_PLANTS, (tx) =>
        tx.appUser.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
          },
        }),
      )
      throw invalid
    }

    const rehashed = needsRehash(user.passwordHash)
      ? { passwordHash: await hashPassword(request.password) }
      : {}
    await withTenantTransaction(user.tenantId, ALL_PLANTS, (tx) =>
      tx.appUser.update({
        where: { id: user.id },
        // Transparent upgrade when the cost parameters are raised.
        data: { failedLoginAttempts: 0, lockedUntil: null, ...rehashed },
      }),
    )

    return this.issue(user.tenantId, user.id, {
      permissions: [...new Set(user.roles.flatMap((r) => r.role.permissions))],
      isSuperAdmin: user.isSuperAdmin,
      plantIds: user.plantAccess.map((a) => a.plantId),
      departmentIds: user.deptAccess.map((a) => a.departmentId),
    })
  }

  /**
   * Rotating refresh: every use issues a new token and revokes the old one.
   * Reuse of an already-rotated token means it leaked, so the whole family for
   * that user is revoked — the thief and the victim are both logged out, which
   * is the correct outcome.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const invalid = new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Session expired. Sign in again.',
    })

    const tenantId = tenantIdFromToken(refreshToken)
    if (tenantId === null) throw invalid

    const stored = await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
      tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(refreshToken) },
        include: { user: { include: { roles: { include: { role: true } } } } },
      }),
    )
    if (stored === null) throw invalid

    if (stored.revokedAt !== null) {
      // Reuse of a rotated token means it leaked. Revoke the whole family: the
      // thief and the victim are both signed out, which is the right outcome.
      await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
        tx.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      )
      throw invalid
    }

    if (stored.expiresAt <= new Date() || !stored.user.isActive) throw invalid

    // Scope is re-read on every refresh, so revoking a user's access to a plant
    // takes effect within one access-token lifetime rather than at next login.
    const scope = await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
      tx.appUser.findUniqueOrThrow({
        where: { id: stored.userId },
        include: { roles: { include: { role: true } }, plantAccess: true, deptAccess: true },
      }),
    )
    const pair = await this.issue(stored.tenantId, stored.userId, {
      permissions: [...new Set(scope.roles.flatMap((r) => r.role.permissions))],
      isSuperAdmin: scope.isSuperAdmin,
      plantIds: scope.plantAccess.map((a) => a.plantId),
      departmentIds: scope.deptAccess.map((a) => a.departmentId),
    })
    await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
      tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    )
    return pair
  }

  async logout(refreshToken: string): Promise<void> {
    const tenantId = tenantIdFromToken(refreshToken)
    if (tenantId === null) return
    await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
      tx.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    )
  }

  private async issue(
    tenantId: string,
    userId: string,
    scope: {
      permissions: string[]
      isSuperAdmin: boolean
      plantIds: string[]
      departmentIds: string[]
    },
  ): Promise<TokenPair> {
    // `<tenantId>.<secret>`. The tenant is a routing hint so the lookup can
    // establish RLS context — it is not a secret, and it is already visible in
    // the access token. All the entropy is in the second half.
    const refreshToken = `${tenantId}.${randomBytes(32).toString('base64url')}`
    await withTenantTransaction(tenantId, ALL_PLANTS, (tx) =>
      tx.refreshToken.create({
        data: {
          tenantId,
          userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      }),
    )
    return {
      accessToken: this.jwt.sign({
        sub: userId,
        tid: tenantId,
        perms: scope.permissions,
        sa: scope.isSuperAdmin,
        plants: scope.plantIds,
        depts: scope.departmentIds,
      }),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    }
  }
}
