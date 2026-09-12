import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type NestMiddleware,
} from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { runWithTenant } from './tenant-context'

/**
 * Phase 0 has no authentication yet, so there is no trustworthy source for the
 * tenant id. Reading it from a header would let any caller name any tenant —
 * a cross-tenant read of every table in the system.
 *
 * So this fails CLOSED. The header stub is available only when an operator has
 * deliberately switched it on outside production. Absent that, every
 * tenant-scoped request is refused, which makes the missing auth impossible to
 * ignore and impossible to deploy by accident.
 *
 * Phase 1 replaces this with a verified JWT and derives the tenant from a signed
 * claim. This function and the flag disappear at that point.
 */
export function isHeaderTenancyAllowed(env: NodeJS.ProcessEnv): boolean {
  return env['NODE_ENV'] !== 'production' && env['PRODX_ALLOW_HEADER_TENANT'] === '1'
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (!isHeaderTenancyAllowed(process.env)) {
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message:
          'Tenant resolution is not configured. Phase 0 has no authentication; ' +
          'set PRODX_ALLOW_HEADER_TENANT=1 outside production to use the header stub.',
      })
    }

    const tenantId = req.header('x-tenant-id')
    if (tenantId === undefined || tenantId.length === 0) {
      throw new UnauthorizedException({ code: 'TENANT_REQUIRED', message: 'Tenant not resolved' })
    }

    runWithTenant({ tenantId, userId: req.header('x-user-id') ?? null }, () => next())
  }
}
