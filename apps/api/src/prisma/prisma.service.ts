import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { forTenant, prisma, type TenantClient } from '@prodx/db'
import { currentTenantId } from '../tenancy/tenant-context'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /** Tenant-scoped client for the current request. Use this everywhere. */
  get db(): TenantClient {
    return forTenant(currentTenantId())
  }

  /**
   * Unscoped client. Platform operations only — login (which must resolve the
   * tenant before one exists), tenant provisioning, outbox delivery. Every use
   * must be justified in review.
   */
  get unscoped(): typeof prisma {
    return prisma
  }

  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect()
  }
}
