/**
 * Creates a demo tenant you can log into and click around.
 *
 *   pnpm --filter @prodx/api seed:demo
 *
 * Idempotent: drops and recreates the demo tenant each run, so the numbers are
 * always the same and a broken experiment costs nothing.
 */
import { hashPassword } from '@prodx/core'
import { ALL_PLANTS, prisma, withTenantTransaction } from '@prodx/db'
import { randomUUID } from 'node:crypto'

const TENANT_CODE = 'DEMO'
const PASSWORD = 'prodx-demo-2026'

async function main(): Promise<void> {
  const existing = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } })
  if (existing !== null) {
    // Children first: every foreign key is onDelete: Restrict by design, so
    // business documents can never vanish by accident.
    const t = existing.id
    await withTenantTransaction(t, ALL_PLANTS, async (tx) => {
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
      await tx.userDepartmentAccess.deleteMany({})
      await tx.userPlantAccess.deleteMany({})
      await tx.department.deleteMany({})
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

  const uid = (): string => randomUUID()
  const id = {
    legalEntity: uid(),
    uomNos: uid(),
    uomKg: uid(),
    uomMtr: uid(),
    fiscalYear: uid(),
    supplier: uid(),
    roleAdmin: uid(),
    rolePlantHead: uid(),
    roleStores: uid(),
  }

  const passwordHash = await hashPassword(PASSWORD)

  /** Two factories, so "only my plant" is something you can actually see. */
  const FACTORIES = [
    { code: 'CARTON-01', name: 'Carton Plant, Bhiwandi', items: [
      { code: 'RM-KRAFT-180', name: 'Kraft Liner 180 GSM', uom: 'kg', dual: 'mtr', rate: '48.50' },
      { code: 'RM-FLUTE-120', name: 'Fluting Medium 120 GSM', uom: 'kg', dual: null, rate: '41.25' },
      { code: 'FG-5PLY-BOX', name: '5 Ply Export Box', uom: 'nos', dual: null, rate: '86.00' },
    ] },
    { code: 'TEXTILE-01', name: 'Textile Plant, Ichalkaranji', items: [
      { code: 'RM-YARN-40S', name: 'Cotton Yarn 40s', uom: 'kg', dual: null, rate: '268.00' },
      { code: 'FG-POPLIN', name: 'Cotton Poplin 40s', uom: 'mtr', dual: 'kg', rate: '112.50' },
    ] },
  ] as const

  const DEPARTMENTS = ['STORES', 'PRODUCTION', 'QUALITY', 'PURCHASE'] as const

  await withTenantTransaction(tenantId, ALL_PLANTS, async (tx) => {
    await tx.legalEntity.create({
      data: {
        id: id.legalEntity,
        tenantId,
        code: 'DMPL',
        name: 'Demo Manufacturing Pvt Ltd',
        taxRegistrationNo: '27AAAAA0000A1Z5',
      },
    })

    await tx.uom.createMany({
      data: [
        { id: id.uomNos, tenantId, code: 'NOS', name: 'Numbers', dimension: 'COUNT' },
        { id: id.uomKg, tenantId, code: 'KGM', name: 'Kilogram', dimension: 'MASS' },
        { id: id.uomMtr, tenantId, code: 'MTR', name: 'Metre', dimension: 'LENGTH' },
      ],
    })
    const uomId = { nos: id.uomNos, kg: id.uomKg, mtr: id.uomMtr }

    // Same permissions, different scope: the two plant heads are identical as
    // roles and see completely different data. That separation is the point.
    await tx.role.createMany({
      data: [
        { id: id.roleAdmin, tenantId, code: 'ADMIN', name: 'Administrator', permissions: ['*'] },
        {
          id: id.rolePlantHead, tenantId, code: 'PLANT_HEAD', name: 'Plant Head',
          permissions: ['purchase_order:*', 'goods_receipt:*', 'stock:read', 'gate:*'],
        },
        {
          id: id.roleStores, tenantId, code: 'STORE_EXECUTIVE', name: 'Store Executive',
          permissions: ['purchase_order:read', 'goods_receipt:read', 'goods_receipt:post', 'stock:read'],
        },
      ],
    })

    await tx.fiscalYear.create({
      data: {
        id: id.fiscalYear, tenantId, legalEntityId: id.legalEntity, code: '2026-27',
        startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
      },
    })
    for (let month = 0; month < 12; month++) {
      await tx.fiscalPeriod.create({
        data: {
          tenantId, fiscalYearId: id.fiscalYear, sequence: month + 1,
          startDate: new Date(Date.UTC(2026, 3 + month, 1)),
          endDate: new Date(Date.UTC(2026, 4 + month, 0)),
          // April to August closed, so the period lock is visible, not theoretical.
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
          tenantId, legalEntityId: id.legalEntity, seriesCode, fiscalYear: '2026-27',
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

    const plantIds: Record<string, string> = {}
    const storesDept: Record<string, string> = {}
    let poSeq = 0

    for (const factory of FACTORIES) {
      const plantId = uid()
      plantIds[factory.code] = plantId
      await tx.plant.create({
        data: { id: plantId, tenantId, legalEntityId: id.legalEntity, code: factory.code, name: factory.name },
      })
      const warehouseId = uid()
      await tx.warehouse.create({
        data: { id: warehouseId, tenantId, plantId, code: `${factory.code}-WH`, name: 'Main Store' },
      })
      await tx.storageLocation.create({
        data: { tenantId, warehouseId, code: 'BAY-01', name: 'Bay 01' },
      })

      for (const dept of DEPARTMENTS) {
        const departmentId = uid()
        if (dept === 'STORES') storesDept[factory.code] = departmentId
        await tx.department.create({
          data: { id: departmentId, tenantId, plantId, code: dept, name: dept.charAt(0) + dept.slice(1).toLowerCase() },
        })
      }

      poSeq++
      const poId = uid()
      await tx.purchaseOrder.create({
        data: {
          id: poId, tenantId, legalEntityId: id.legalEntity, plantId,
          documentNo: `PO/2026-27/${String(poSeq).padStart(4, '0')}`,
          supplierId: id.supplier, state: 'RELEASED',
          orderDate: new Date('2026-09-05'), totalAmount: '0',
        },
      })

      let total = 0
      let lineNo = 0
      for (const spec of factory.items) {
        lineNo++
        const itemId = uid()
        await tx.item.create({
          data: {
            id: itemId, tenantId, code: spec.code, name: spec.name,
            baseUomId: uomId[spec.uom],
            isDualUom: spec.dual !== null,
            secondaryUomId: spec.dual === null ? null : uomId[spec.dual],
          },
        })
        await tx.stockUnit.create({
          data: { tenantId, itemId, reference: `LOT-${spec.code}-001`, granularity: 'LOT', grade: 'A' },
        })
        const quantity = lineNo * 500
        const amount = (quantity * Number(spec.rate)).toFixed(2)
        total += Number(amount)
        await tx.purchaseOrderLine.create({
          data: {
            tenantId, purchaseOrderId: poId, lineNo, itemId,
            quantity: String(quantity), rate: spec.rate, amount,
          },
        })
      }
      await tx.purchaseOrder.update({ where: { id: poId }, data: { totalAmount: total.toFixed(2) } })
    }

    // Users. Note the two plant heads hold the SAME role and differ only in scope.
    const USERS = [
      { email: 'admin@prodx.demo', name: 'Priya Menon', role: id.roleAdmin, superAdmin: true, plants: [] as string[], depts: [] as string[] },
      { email: 'carton.head@prodx.demo', name: 'Rahul Kumar', role: id.rolePlantHead, superAdmin: false, plants: [plantIds['CARTON-01'] ?? ''], depts: [] },
      { email: 'textile.head@prodx.demo', name: 'Sneha Patil', role: id.rolePlantHead, superAdmin: false, plants: [plantIds['TEXTILE-01'] ?? ''], depts: [] },
      { email: 'carton.stores@prodx.demo', name: 'Anita Shah', role: id.roleStores, superAdmin: false, plants: [plantIds['CARTON-01'] ?? ''], depts: [storesDept['CARTON-01'] ?? ''] },
    ]

    for (const u of USERS) {
      const userId = uid()
      await tx.appUser.create({
        data: { id: userId, tenantId, email: u.email, displayName: u.name, passwordHash, isSuperAdmin: u.superAdmin },
      })
      await tx.userRole.create({ data: { tenantId, userId, roleId: u.role } })
      for (const plantId of u.plants) {
        await tx.userPlantAccess.create({ data: { tenantId, userId, plantId } })
      }
      for (const departmentId of u.depts) {
        await tx.userDepartmentAccess.create({ data: { tenantId, userId, departmentId } })
      }
    }
  })

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  Demo tenant ready.',
      '',
      `    Tenant code : ${TENANT_CODE}`,
      `    Password    : ${PASSWORD}   (all users)`,
      '',
      '    admin@prodx.demo          superadmin — both factories',
      '    carton.head@prodx.demo    Carton Plant only',
      '    textile.head@prodx.demo   Textile Plant only',
      '    carton.stores@prodx.demo  Carton Plant, Stores department, fewer rights',
      '',
      '    The two plant heads hold the SAME role and see different data.',
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
