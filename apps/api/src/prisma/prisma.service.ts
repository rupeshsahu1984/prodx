import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { forTenant, prisma, type TenantClient } from '@prodx/db'
import { currentTenant } from '../tenancy/tenant-context'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /** Tenant-scoped client for the current request. Use this everywhere. */
  get db(): TenantClient {
    return forTenant(currentTenant().tenantId)
  }

  /**
   * Unscoped client. RLS still applies unless the connecting role is exempt, so
   * this is for platform operations only — migrations, tenant provisioning,
   * outbox delivery. Every use must be justified in review.
   */
  get unscoped(): typeof prisma {
    return prisma
  }

  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect()
  }
}
