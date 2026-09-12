/**
 * Creates a demo tenant you can log into and click around.
 *
 *   pnpm --filter @prodx/api seed:demo
 *
 * Idempotent: drops and recreates the demo tenant each run, so the numbers are
 * always the same and a broken experiment costs nothing.
 */
import { hashPassword } from '@prodx/core'
import { prisma, withTenantTransaction } from '@prodx/db'
import { randomUUID } from 'node:crypto'

const TENANT_CODE = 'DEMO'
const EMAIL_BUYER = 'buyer@prodx.demo'
const EMAIL_MANAGER = 'manager@prodx.demo'
const PASSWORD = 'prodx-demo-2026'

async function main(): Promise<void> {
  const existing = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } })
  if (existing !== null) {
    // Children first: every foreign key is onDelete: Restrict by design, so
    // business documents can never vanish by accident.
    const t = existing.id
    await withTenantTransaction(t, async (tx) => {
      await tx.journalLine.deleteMany({})
      await tx.journalEntry.deleteMany({})
      await tx.stockLedgerEntry.deleteMany({})
      await tx.stockBalance.deleteMany({})
      await tx.itemPlantValuation.deleteMany({})
      await tx.goodsReceiptLine.deleteMany({})
      await tx.goodsReceipt.deleteMany({})
      await tx.weighbridgeTicket.deleteMany({})
      await tx.gateEvent.deleteMany({})
      await tx.purchaseOrderLine.deleteMany({})
      await tx.purchaseOrder.deleteMany({})
      await tx.outboxMessage.deleteMany({})
      await tx.approvalRecord.deleteMany({})
      await tx.approvalRule.deleteMany({})
      await tx.numberSeries.deleteMany({})
      await tx.glAccount.deleteMany({})
      await tx.fiscalPeriod.deleteMany({})
      await tx.fiscalYear.deleteMany({})
      await tx.stockUnit.deleteMany({})
      await tx.itemUomConversion.deleteMany({})
      await tx.item.deleteMany({})
      await tx.uom.deleteMany({})
      await tx.party.deleteMany({})
      await tx.storageLocation.deleteMany({})
      await tx.warehouse.deleteMany({})
      await tx.plant.deleteMany({})
      await tx.userRole.deleteMany({})
      await tx.refreshToken.deleteMany({})
      await tx.appUser.deleteMany({})
      await tx.role.deleteMany({})
      await tx.legalEntity.deleteMany({})
    })
    await prisma.tenant.delete({ where: { id: t } })
  }

  const tenantId = randomUUID()
  await prisma.tenant.create({
    data: { id: tenantId, code: TENANT_CODE, name: 'Demo Manufacturing Pvt Ltd' },
  })

  const id = {
    legalEntity: randomUUID(),
    plant: randomUUID(),
    warehouse: randomUUID(),
    location: randomUUID(),
    uomNos: randomUUID(),
    uomKg: randomUUID(),
    uomMtr: randomUUID(),
    fiscalYear: randomUUID(),
    supplier: randomUUID(),
    roleBuyer: randomUUID(),
    roleManager: randomUUID(),
  }

  const passwordHash = await hashPassword(PASSWORD)

  await withTenantTransaction(tenantId, async (tx) => {
    await tx.legalEntity.create({
      data: {
        id: id.legalEntity,
        tenantId,
        code: 'DMPL',
        name: 'Demo Manufacturing Pvt Ltd',
        taxRegistrationNo: '27AAAAA0000A1Z5',
      },
    })
    await tx.plant.create({
      data: { id: id.plant, tenantId, legalEntityId: id.legalEntity, code: 'P01', name: 'Plant 01' },
    })
    await tx.warehouse.create({
      data: { id: id.warehouse, tenantId, plantId: id.plant, code: 'WH-MAIN', name: 'Main Store' },
    })
    await tx.storageLocation.create({
      data: { id: id.location, tenantId, warehouseId: id.warehouse, code: 'BAY-01', name: 'Bay 01' },
    })

    await tx.uom.createMany({
      data: [
        { id: id.uomNos, tenantId, code: 'NOS', name: 'Numbers', dimension: 'COUNT' },
        { id: id.uomKg, tenantId, code: 'KGM', name: 'Kilogram', dimension: 'MASS' },
        { id: id.uomMtr, tenantId, code: 'MTR', name: 'Metre', dimension: 'LENGTH' },
      ],
    })

    // Roles. The buyer cannot approve — that is maker-checker, not an oversight.
    await tx.role.createMany({
      data: [
        {
          id: id.roleBuyer,
          tenantId,
          code: 'BUYER',
          name: 'Purchase Executive',
          permissions: [
            'purchase_order:read',
            'purchase_order:create',
            'purchase_order:submit',
            'goods_receipt:read',
            'goods_receipt:post',
            'stock:read',
          ],
        },
        {
          id: id.roleManager,
          tenantId,
          code: 'PURCHASE_MANAGER',
          name: 'Purchase Manager',
          permissions: [
            'purchase_order:*',
            'goods_receipt:*',
            'stock:read',
            'gate:*',
          ],
          conflictsWith: [],
        },
      ],
    })

    for (const [email, name, roleId] of [
      [EMAIL_BUYER, 'Anita Shah', id.roleBuyer],
      [EMAIL_MANAGER, 'Rahul Kumar', id.roleManager],
    ] as const) {
      const userId = randomUUID()
      await tx.appUser.create({
        data: { id: userId, tenantId, email, displayName: name, passwordHash },
      })
      await tx.userRole.create({ data: { tenantId, userId, roleId } })
    }

    await tx.fiscalYear.create({
      data: {
        id: id.fiscalYear,
        tenantId,
        legalEntityId: id.legalEntity,
        code: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
      },
    })
    for (let month = 0; month < 12; month++) {
      const start = new Date(Date.UTC(2026, 3 + month, 1))
      const end = new Date(Date.UTC(2026, 4 + month, 0))
      await tx.fiscalPeriod.create({
        data: {
          tenantId,
          fiscalYearId: id.fiscalYear,
          sequence: month + 1,
          startDate: start,
          endDate: end,
          // Everything before September is closed, so the period lock is visible.
          status: month < 5 ? 'CLOSED' : 'OPEN',
        },
      })
    }

    await tx.glAccount.createMany({
      data: [
        { tenantId, legalEntityId: id.legalEntity, code: 'INVENTORY', name: 'Raw Material Inventory', accountType: 'ASSET' },
        { tenantId, legalEntityId: id.legalEntity, code: 'GRN_ACCRUAL', name: 'Goods Received Not Invoiced', accountType: 'LIABILITY' },
      ],
    })

    for (const seriesCode of ['PURCHASE_ORDER', 'GOODS_RECEIPT']) {
      await tx.numberSeries.create({
        data: {
          tenantId,
          legalEntityId: id.legalEntity,
          seriesCode,
          fiscalYear: '2026-27',
          format: `${seriesCode === 'PURCHASE_ORDER' ? 'PO' : 'GRN'}/{FY}/{####}`,
          nextValue: 1,
        },
      })
    }

    await tx.approvalRule.createMany({
      data: [
        { tenantId, documentType: 'PURCHASE_ORDER', minAmount: '0', maxAmount: '100000', permission: 'purchase_order:approve', sequence: 1 },
        { tenantId, documentType: 'PURCHASE_ORDER', minAmount: '100000', maxAmount: null, permission: 'purchase_order:approve', sequence: 1 },
      ],
    })

    await tx.party.create({
      data: { id: id.supplier, tenantId, code: 'SUP-001', name: 'Kraft Paper Co.', type: 'SUPPLIER' },
    })

    // Carton and textile items, including a dual-UoM one: kraft liner is bought
    // by weight but consumed by length.
    const items = [
      { code: 'RM-KRAFT-180', name: 'Kraft Liner 180 GSM', uom: id.uomKg, dual: id.uomMtr, rate: '48.50' },
      { code: 'RM-FLUTE-120', name: 'Fluting Medium 120 GSM', uom: id.uomKg, dual: null, rate: '41.25' },
      { code: 'FG-5PLY-BOX', name: '5 Ply Export Box', uom: id.uomNos, dual: null, rate: '86.00' },
    ]

    const poId = randomUUID()
    await tx.purchaseOrder.create({
      data: {
        id: poId,
        tenantId,
        legalEntityId: id.legalEntity,
        plantId: id.plant,
        documentNo: 'PO/2026-27/0001',
        supplierId: id.supplier,
        state: 'RELEASED',
        orderDate: new Date('2026-09-05'),
        totalAmount: '0',
      },
    })

    let total = 0
    let lineNo = 0
    for (const spec of items) {
      lineNo++
      const itemId = randomUUID()
      await tx.item.create({
        data: {
          id: itemId,
          tenantId,
          code: spec.code,
          name: spec.name,
          baseUomId: spec.uom,
          isDualUom: spec.dual !== null,
          secondaryUomId: spec.dual,
        },
      })
      await tx.stockUnit.create({
        data: {
          tenantId,
          itemId,
          reference: `LOT-${spec.code}-001`,
          granularity: 'LOT',
          grade: 'A',
        },
      })
      const quantity = lineNo * 500
      const amount = (quantity * Number(spec.rate)).toFixed(2)
      total += Number(amount)
      await tx.purchaseOrderLine.create({
        data: {
          tenantId,
          purchaseOrderId: poId,
          lineNo,
          itemId,
          quantity: String(quantity),
          rate: spec.rate,
          amount,
        },
      })
    }
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { totalAmount: total.toFixed(2) },
    })
  })

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  Demo tenant ready.',
      '',
      `    Tenant code : ${TENANT_CODE}`,
      `    Buyer       : ${EMAIL_BUYER}   (cannot approve — maker-checker)`,
      `    Manager     : ${EMAIL_MANAGER}`,
      `    Password    : ${PASSWORD}`,
      '',
      '    One released purchase order with 3 lines, awaiting receipt.',
      '    April-August are CLOSED periods; September is open.',
      '',
    ].join('\n'),
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
