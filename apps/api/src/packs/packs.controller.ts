import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { AnyAuthenticated, RequirePermission } from '../auth/permissions.guard'
import { currentContext } from '../tenancy/tenant-context'
import { PacksService, type PackView } from './packs.service'

@Controller('packs')
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  /** Any signed-in user may see which industry packs are active. */
  @Get()
  @AnyAuthenticated()
  list(): Promise<PackView[]> {
    return this.packs.list(currentContext().tenantId)
  }

  @Get('navigation')
  @AnyAuthenticated()
  navigation(): unknown {
    const { packScope, permissions } = currentContext()
    return this.packs.navigation(packScope === '*' ? [] : packScope, permissions)
  }

  @Post(':id/install')
  @RequirePermission('pack:manage')
  @HttpCode(204)
  async install(@Param('id') id: string): Promise<void> {
    const { tenantId, userId } = currentContext()
    await this.packs.install(tenantId, id, userId)
  }

  @Post(':id/disable')
  @RequirePermission('pack:manage')
  @HttpCode(204)
  async disable(@Param('id') id: string): Promise<void> {
    await this.packs.disable(currentContext().tenantId, id)
  }

  @Delete(':id')
  @RequirePermission('pack:manage')
  @HttpCode(204)
  async uninstall(@Param('id') id: string): Promise<void> {
    await this.packs.uninstall(currentContext().tenantId, id)
  }
}
