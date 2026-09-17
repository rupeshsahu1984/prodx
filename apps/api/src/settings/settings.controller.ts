import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AnyAuthenticated, RequirePermission } from '../auth/permissions.guard'
import { currentContext, currentDbScope } from '../tenancy/tenant-context'
import { SettingsService, type PeriodStatus } from './settings.service'

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any signed-in user may see how their tenant is configured. */
  @Get()
  @AnyAuthenticated()
  overview(): Promise<unknown> {
    return this.settings.overview(currentDbScope())
  }

  @Get('audit')
  @RequirePermission('master_data:read')
  audit(): Promise<unknown> {
    return this.settings.recentAudit(currentDbScope())
  }

  @Post('periods/:id/status')
  @RequirePermission('period:close')
  @HttpCode(200)
  setPeriodStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: PeriodStatus },
  ): Promise<unknown> {
    const { userId, permissions } = currentContext()
    return this.settings.setPeriodStatus(currentDbScope(), id, body.status, {
      actorId: userId,
      permissions,
    })
  }
}
