import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { LoginRequest, TokenPair } from '@prodx/contracts'
import { hashPassword, needsRehash, verifyPassword } from '@prodx/core'
import { prisma } from '@prodx/db'
import { createHash, randomBytes } from 'node:crypto'
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service'

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MS = 15 * 60 * 1000

/** Stored hashed: a database read must not yield a usable credential. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Login runs on the UNSCOPED client by necessity: there is no tenant context
   * until the user is identified. It is the one place that must, and every
   * query here filters by the resolved tenant explicitly.
   */
  async login(request: LoginRequest): Promise<TokenPair> {
    const tenant = await prisma.tenant.findUnique({ where: { code: request.tenantCode } })

    const user =
      tenant === null || !tenant.isActive
        ? null
        : await prisma.appUser.findUnique({
            where: { tenantId_email: { tenantId: tenant.id, email: request.email.toLowerCase() } },
            include: { roles: { include: { role: true } } },
          })

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
      await prisma.appUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      })
      throw invalid
    }

    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Transparent upgrade when the cost parameters are raised.
        ...(needsRehash(user.passwordHash)
          ? { passwordHash: await hashPassword(request.password) }
          : {}),
      },
    })

    const permissions = [...new Set(user.roles.flatMap((r) => r.role.permissions))]
    return this.issue(user.tenantId, user.id, permissions)
  }

  /**
   * Rotating refresh: every use issues a new token and revokes the old one.
   * Reuse of an already-rotated token means it leaked, so the whole family for
   * that user is revoked — the thief and the victim are both logged out, which
   * is the correct outcome.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { include: { roles: { include: { role: true } } } } },
    })

    const invalid = new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Session expired. Sign in again.',
    })

    if (stored === null) throw invalid

    if (stored.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw invalid
    }

    if (stored.expiresAt <= new Date() || !stored.user.isActive) throw invalid

    const permissions = [...new Set(stored.user.roles.flatMap((r) => r.role.permissions))]
    const pair = await this.issue(stored.tenantId, stored.userId, permissions)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })
    return pair
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async issue(
    tenantId: string,
    userId: string,
    permissions: string[],
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url')
    await prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    })
    return {
      accessToken: this.jwt.sign({ sub: userId, tid: tenantId, perms: permissions }),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    }
  }
}
