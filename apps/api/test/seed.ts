import { platformScope, withScope, type Prisma } from '@prodx/db'
import { randomUUID } from 'node:crypto'

export interface Scenario {
  tenantId: string
  legalEntityId: string
  plantId: string
  storageLocationId: string
  itemId: string
  stockUnitId: string
  purchaseOrderId: string
  purchaseOrderLineId: string
  goodsReceiptId: string
  goodsReceiptLineId: string
}

const today = new Date('2026-09-12T00:00:00.000Z')

/**
 * A complete purchase-to-receipt scenario: 100 units ordered at 25.00, with a
 * draft receipt for 40 of them, plus the chart of accounts, fiscal calendar and
 * number series the posting needs.
 */
export async function seedScenario(
  options: { periodStatus?: 'OPEN' | 'SOFT_CLOSED' | 'CLOSED'; receiptQuantity?: string } = {},
): Promise<Scenario> {
  const tenantId = randomUUID()
  const ids = {
    legalEntityId: randomUUID(),
    plantId: randomUUID(),
    warehouseId: randomUUID(),
    storageLocationId: randomUUID(),
    uomId: randomUUID(),
    itemId: randomUUID(),
    supplierId: randomUUID(),
    stockUnitId: randomUUID(),
    purchaseOrderId: randomUUID(),
    purchaseOrderLineId: randomUUID(),
    goodsReceiptId: randomUUID(),
    goodsReceiptLineId: randomUUID(),
    fiscalYearId: randomUUID(),
  }
  const receiptQuantity = options.receiptQuantity ?? '40'

  // The tenant row itself has no tenant_id, so it carries no policy.
  const { prisma } = await import('@prodx/db')
  await prisma.tenant.create({ data: { id: tenantId, code: `T-${tenantId.slice(0, 8)}`, name: 'Test' } })

  await withScope(platformScope(tenantId), async (tx: Prisma.TransactionClient) => {
    await tx.legalEntity.create({
      data: { id: ids.legalEntityId, tenantId, code: 'LE1', name: 'Legal Entity' },
    })
    await tx.plant.create({
      data: { id: ids.plantId, tenantId, legalEntityId: ids.legalEntityId, code: 'P1', name: 'Plant 1' },
    })
    await tx.warehouse.create({
      data: { id: ids.warehouseId, tenantId, plantId: ids.plantId, code: 'WH1', name: 'Main' },
    })
    await tx.storageLocation.create({
      data: { id: ids.storageLocationId, tenantId, warehouseId: ids.warehouseId, code: 'L1', name: 'Bay 1' },
    })
    await tx.uom.create({
      data: { id: ids.uomId, tenantId, code: 'NOS', name: 'Numbers', dimension: 'COUNT' },
    })
    await tx.item.create({
      data: { id: ids.itemId, tenantId, code: 'RM-001', name: 'Kraft Liner', baseUomId: ids.uomId },
    })
    await tx.party.create({
      data: { id: ids.supplierId, tenantId, code: 'SUP1', name: 'Kraft Paper Co.', type: 'SUPPLIER' },
    })
    await tx.stockUnit.create({
      data: {
        id: ids.stockUnitId,
        tenantId,
        itemId: ids.itemId,
        reference: 'LOT-001',
        granularity: 'LOT',
      },
    })

    await tx.fiscalYear.create({
      data: {
        id: ids.fiscalYearId,
        tenantId,
        legalEntityId: ids.legalEntityId,
        code: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
      },
    })
    await tx.fiscalPeriod.create({
      data: {
        tenantId,
        fiscalYearId: ids.fiscalYearId,
        sequence: 6,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        status: options.periodStatus ?? 'OPEN',
      },
    })

    for (const [code, name, type] of [
      ['INVENTORY', 'Inventory', 'ASSET'],
      ['GRN_ACCRUAL', 'Goods received not invoiced', 'LIABILITY'],
    ] as const) {
      await tx.glAccount.create({
        data: { tenantId, legalEntityId: ids.legalEntityId, code, name, accountType: type },
      })
    }

    await tx.numberSeries.create({
      data: {
        tenantId,
        legalEntityId: ids.legalEntityId,
        seriesCode: 'GOODS_RECEIPT',
        fiscalYear: '2026-27',
        format: 'GRN/{FY}/{####}',
        nextValue: 1,
      },
    })

    await tx.purchaseOrder.create({
      data: {
        id: ids.purchaseOrderId,
        tenantId,
        legalEntityId: ids.legalEntityId,
        plantId: ids.plantId,
        documentNo: 'PO/2026-27/0001',
        supplierId: ids.supplierId,
        state: 'RELEASED',
        orderDate: today,
        totalAmount: '2500.00',
      },
    })
    await tx.purchaseOrderLine.create({
      data: {
        id: ids.purchaseOrderLineId,
        tenantId,
        purchaseOrderId: ids.purchaseOrderId,
        lineNo: 1,
        itemId: ids.itemId,
        quantity: '100',
        rate: '25',
        amount: '2500.00',
      },
    })

    await tx.goodsReceipt.create({
      data: {
        id: ids.goodsReceiptId,
        tenantId,
        legalEntityId: ids.legalEntityId,
        plantId: ids.plantId,
        documentNo: null,
        purchaseOrderId: ids.purchaseOrderId,
        supplierId: ids.supplierId,
        state: 'DRAFT',
        postingDate: today,
      },
    })
    await tx.goodsReceiptLine.create({
      data: {
        id: ids.goodsReceiptLineId,
        tenantId,
        goodsReceiptId: ids.goodsReceiptId,
        lineNo: 1,
        purchaseOrderLineId: ids.purchaseOrderLineId,
        itemId: ids.itemId,
        stockUnitId: ids.stockUnitId,
        storageLocationId: ids.storageLocationId,
        quantity: receiptQuantity,
        unitCost: '25',
        amount: (Number(receiptQuantity) * 25).toFixed(2),
      },
    })
  })

  return { tenantId, ...ids }
}
