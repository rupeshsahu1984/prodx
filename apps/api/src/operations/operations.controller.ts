import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AnyAuthenticated, RequirePermission } from '../auth/permissions.guard'
import { PostingService } from '../posting/posting.service'
import { PrismaService } from '../prisma/prisma.service'
import { currentContext, currentDbScope } from '../tenancy/tenant-context'

/**
 * Read and action endpoints for the procure-to-receive flow.
 *
 * Every route declares its permission. The global guard denies anything that
 * declares neither @RequirePermission nor @Public, so a forgotten decorator is
 * a 403 in development rather than an open endpoint in production.
 */
@Controller()
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  @Get('me')
  @AnyAuthenticated()
  async me(): Promise<unknown> {
    const { userId, tenantId, permissions, departmentIds, packScope } = currentContext()
    const user = await this.prisma.db.appUser.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true, isSuperAdmin: true },
    })
    // Reads through the scoped client, so this returns only the plants the
    // caller may actually see — the list is the scope, not a copy of it.
    const [plants, departments] = await Promise.all([
      this.prisma.db.plant.findMany({ select: { id: true, code: true, name: true } }),
      departmentIds.length === 0
        ? this.prisma.db.department.findMany({ select: { id: true, code: true, name: true } })
        : this.prisma.db.department.findMany({
            where: { id: { in: [...departmentIds] } },
            select: { id: true, code: true, name: true },
          }),
    ])
    return {
      userId, tenantId, permissions, ...user, plants, departments,
      packs: packScope === '*' ? [] : [...packScope],
    }
  }

  @Get('purchase-orders')
  @RequirePermission('purchase_order:read')
  async purchaseOrders(): Promise<unknown> {
    return this.prisma.db.purchaseOrder.findMany({
      orderBy: { documentNo: 'asc' },
      take: 50,
      include: {
        supplier: { select: { code: true, name: true } },
        plant: { select: { code: true } },
        lines: {
          orderBy: { lineNo: 'asc' },
          include: { item: { select: { code: true, name: true, isDualUom: true } } },
        },
      },
    })
  }

  @Get('goods-receipts')
  @RequirePermission('goods_receipt:read')
  async goodsReceipts(): Promise<unknown> {
    return this.prisma.db.goodsReceipt.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { documentNo: true } },
        lines: { include: { item: { select: { code: true, name: true } } } },
      },
    })
  }

  @Get('stock/balances')
  @RequirePermission('stock:read')
  async stock(): Promise<unknown> {
    const [balances, valuations] = await Promise.all([
      this.prisma.db.stockBalance.findMany({
        include: {
          stockUnit: { include: { item: { select: { code: true, name: true } } } },
          storageLocation: { select: { code: true, name: true } },
        },
      }),
      this.prisma.db.itemPlantValuation.findMany({
        include: { item: { select: { code: true, name: true } } },
      }),
    ])
    return { balances, valuations }
  }

  @Get('stock/ledger')
  @RequirePermission('stock:read')
  async ledger(): Promise<unknown> {
    return this.prisma.db.stockLedgerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { item: { select: { code: true, name: true } } },
    })
  }

  @Get('journal')
  @RequirePermission('stock:read')
  async journal(): Promise<unknown> {
    return this.prisma.db.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { lines: { include: { glAccount: { select: { code: true, name: true } } } } },
    })
  }

  /** Creates a draft receipt for every outstanding line on the order. */
  @Post('purchase-orders/:id/receive')
  @RequirePermission('goods_receipt:post')
  @HttpCode(201)
  async createReceipt(
    @Param('id', ParseUUIDPipe) purchaseOrderId: string,
    @Body() body: { postingDate?: string },
  ): Promise<{ goodsReceiptId: string }> {
    const { withScope } = await import('@prodx/db')
    const { tenantId } = currentContext()

    return withScope(currentDbScope(), async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrderId },
        include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
      })

      const outstanding = po.lines.filter((l) => Number(l.quantity) > Number(l.receivedQuantity))
      if (outstanding.length === 0) {
        throw new Error('Nothing outstanding on this order.')
      }

      const grn = await tx.goodsReceipt.create({
        data: {
          tenantId,
          legalEntityId: po.legalEntityId,
          plantId: po.plantId,
          documentNo: '',
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          state: 'DRAFT',
          postingDate: body.postingDate === undefined ? new Date() : new Date(body.postingDate),
        },
      })

      const location = await tx.storageLocation.findFirstOrThrow({
        where: { warehouse: { plantId: po.plantId } },
      })

      let lineNo = 0
      for (const line of outstanding) {
        lineNo++
        const stockUnit = await tx.stockUnit.findFirstOrThrow({ where: { itemId: line.itemId } })
        const quantity = Number(line.quantity) - Number(line.receivedQuantity)
        await tx.goodsReceiptLine.create({
          data: {
            tenantId,
            goodsReceiptId: grn.id,
            lineNo,
            purchaseOrderLineId: line.id,
            itemId: line.itemId,
            stockUnitId: stockUnit.id,
            storageLocationId: location.id,
            quantity: String(quantity),
            unitCost: line.rate.toString(),
            amount: (quantity * Number(line.rate)).toFixed(2),
          },
        })
      }

      return { goodsReceiptId: grn.id }
    })
  }

  @Post('goods-receipts/:id/post')
  @RequirePermission('goods_receipt:post')
  @HttpCode(200)
  async post(@Param('id', ParseUUIDPipe) id: string): Promise<{ documentNo: string }> {
    const { userId, permissions } = currentContext()
    return this.posting.postGoodsReceipt(id, {
      actorId: userId,
      permissions,
      scope: currentDbScope(),
      canPostAdjustments: false,
    })
  }

  @Post('goods-receipts/:id/reverse')
  @RequirePermission('goods_receipt:reverse')
  @HttpCode(204)
  async reverse(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const { userId, permissions } = currentContext()
    await this.posting.reverseGoodsReceipt(id, {
      actorId: userId,
      permissions,
      scope: currentDbScope(),
      canPostAdjustments: false,
    })
  }
}
