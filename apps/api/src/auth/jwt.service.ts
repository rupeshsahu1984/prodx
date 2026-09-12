import { Injectable } from '@nestjs/common'
import { accessClaimsSchema, type AccessClaims } from '@prodx/contracts'
import jwt from 'jsonwebtoken'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60

/**
 * Access tokens are HS256. The API is both issuer and verifier, so there is no
 * key-distribution problem to solve and an asymmetric scheme would buy nothing
 * today. If SSO or a second verifying service arrives, move to RS256 with a
 * JWKS endpoint — the claim shape does not change.
 *
 * They are deliberately short-lived: permissions are embedded to avoid a
 * database read per request, so a revoked role takes effect within one token
 * lifetime rather than instantly. Fifteen minutes is the price of that trade.
 */
@Injectable()
export class JwtService {
  private readonly secret: string

  constructor() {
    const secret = process.env['JWT_SECRET']
    // Refuse to boot rather than sign with a default. A predictable secret lets
    // anyone mint a token for any tenant.
    if (secret === undefined || secret.length < 32) {
      throw new Error('JWT_SECRET must be set and at least 32 characters long.')
    }
    this.secret = secret
  }

  sign(claims: AccessClaims): string {
    return jwt.sign(claims, this.secret, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  }

  /** Returns null for anything untrusted — expired, tampered, or the wrong shape. */
  verify(token: string): AccessClaims | null {
    try {
      // Pinning algorithms prevents the "alg: none" and HS/RS confusion attacks.
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] })
      const parsed = accessClaimsSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
