import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { RequirePermission } from '../auth/permissions.guard'
import { currentContext, currentDbScope } from '../tenancy/tenant-context'
import { PurchasingService, type Actor } from './purchasing.service'

@Controller('purchase-orders')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  private actor(): Actor {
    const { userId, permissions } = currentContext()
    return { actorId: userId, permissions, scope: currentDbScope() }
  }

  @Get(':id/approvals')
  @RequirePermission('purchase_order:read')
  approvals(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.purchasing.approvalState(id, this.actor())
  }

  @Post(':id/submit')
  @RequirePermission('purchase_order:submit')
  @HttpCode(200)
  submit(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.purchasing.submit(id, this.actor())
  }

  @Post(':id/approve')
  @RequirePermission('purchase_order:approve')
  @HttpCode(200)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { comment?: string },
  ): Promise<unknown> {
    return this.purchasing.approve(id, this.actor(), body?.comment)
  }

  @Post(':id/reject')
  @RequirePermission('purchase_order:approve')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.purchasing.reject(id, this.actor())
  }

  @Post(':id/release')
  @RequirePermission('purchase_order:release')
  @HttpCode(200)
  release(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.purchasing.release(id, this.actor())
  }
}
