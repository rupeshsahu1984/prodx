import { Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { runWithContext } from '../tenancy/tenant-context'
import { JwtService } from './jwt.service'

/**
 * The only way a request acquires a tenant.
 *
 * The tenant comes from a signed claim, never from a header, a query parameter
 * or a body field — any of those would let a caller name any tenant and read
 * the entire database (ADR 0002).
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.header('authorization') ?? ''
    const [scheme, token] = header.split(' ')

    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.length === 0) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Bearer token required' })
    }

    const claims = this.jwt.verify(token)
    if (claims === null) {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Token is not valid' })
    }

    runWithContext({ tenantId: claims.tid, userId: claims.sub, permissions: claims.perms }, () =>
      next(),
    )
  }
}
