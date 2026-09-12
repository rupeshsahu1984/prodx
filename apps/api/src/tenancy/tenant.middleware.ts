import { Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { runWithTenant } from './tenant-context'

/**
 * Establishes tenant context for the request.
 *
 * Phase 0 reads a header so the stack can be exercised end to end. Before any
 * real data exists this MUST be replaced by a verified JWT claim — a
 * client-supplied tenant id is a cross-tenant read waiting to happen.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = req.header('x-tenant-id')
    if (tenantId === undefined || tenantId.length === 0) {
      throw new UnauthorizedException({ code: 'TENANT_REQUIRED', message: 'Tenant not resolved' })
    }
    const userId = req.header('x-user-id') ?? null
    runWithTenant({ tenantId, userId }, () => next())
  }
}
