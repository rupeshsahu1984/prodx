import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { hasPermission } from '@prodx/core'
import { currentContext } from '../tenancy/tenant-context'

export const PERMISSION_KEY = 'prodx:permission'

/** Declares the permission a route requires: `@RequirePermission('purchase_order:approve')`. */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission)

/**
 * Applied globally, and it DENIES a route that declares no permission.
 *
 * The alternative — allow when unannotated — means a forgotten decorator
 * silently makes an endpoint public. Failing closed turns that mistake into an
 * obvious 403 during development instead of a breach in production. Routes that
 * are genuinely open use @Public().
 */
export const IS_PUBLIC_KEY = 'prodx:public'
/** No token needed at all: login, refresh, health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const REQUIRES_PACK_KEY = 'prodx:requires-pack'
/**
 * Marks a route as belonging to an industry pack.
 *
 * RLS already makes the pack's data invisible when the pack is off, so this is
 * not the security boundary — it is the difference between an endpoint that
 * returns a confusing empty list and one that says the pack is not installed.
 * Defence in depth: if this decorator were forgotten, the caller would still
 * see nothing.
 */
export const RequiresPack = (packId: string) => SetMetadata(REQUIRES_PACK_KEY, packId)

export const ANY_AUTHENTICATED_KEY = 'prodx:any-authenticated'
/**
 * A valid token is enough; no specific permission applies. For routes that only
 * ever return the caller's own context, such as /me.
 *
 * This exists so such routes never have to ask for the `*` permission. Granting
 * a user `*` to let them read their own profile would hand them every other
 * permission in the system too.
 */
export const AnyAuthenticated = () => SetMetadata(ANY_AUTHENTICATED_KEY, true)

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()]

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true) return true

    const pack = this.reflector.getAllAndOverride<string>(REQUIRES_PACK_KEY, targets)
    if (pack !== undefined) {
      const { packScope } = currentContext()
      const enabled = packScope === '*' || packScope.includes(pack)
      if (!enabled) {
        throw new ForbiddenException({
          code: 'PACK_NOT_INSTALLED',
          message: `The ${pack} industry pack is not installed for this tenant.`,
        })
      }
    }

    if (this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets) === true) {
      // Still requires a context, so an unauthenticated call throws here.
      currentContext()
      return true
    }

    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, targets)
    if (required === undefined) {
      throw new ForbiddenException({
        code: 'PERMISSION_NOT_DECLARED',
        message:
          'This route declares no permission. Add @RequirePermission, @AnyAuthenticated or @Public.',
      })
    }

    if (!hasPermission(currentContext().permissions, required)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing permission: ${required}` })
    }
    return true
  }
}
