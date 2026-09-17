/**
 * Creates a demo tenant you can log into and click around.
 *
 *   pnpm --filter @prodx/api seed:demo
 *
 * Idempotent: drops and recreates the demo tenant each run, so the numbers are
 * always the same and a broken experiment costs nothing.
 */
import { hashPassword } from '@prodx/core'
import { platformScope, prisma, withScope } from '@prodx/db'
import { randomUUID } from 'node:crypto'

const TENANT_CODE = 'DEMO'
const PASSWORD = 'prodx-demo-2026'

async function main(): Promise<void> {
  /**
   * The old demo tenant is ARCHIVED, not deleted.
   *
   * The first version of this script tried to wipe it, and the append-only
   * trigger refused: journal lines and stock movements cannot be deleted, by
   * anyone, ever (CLAUDE.md invariant 2). That is the guarantee working, so the
   * seed respects it instead of working around it — the previous tenant keeps
   * its history under a dated code and a fresh DEMO is created alongside.
   */
  const existing = await prisma.tenant.findUnique({ where: { code: TENANT_CODE } })
  if (existing !== null) {
    const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
    await prisma.tenant.update({
      where: { id: existing.id },
      data: { code: `${TENANT_CODE}-ARCHIVED-${stamp}`, isActive: false },
    })
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

  await withScope(platformScope(tenantId), async (tx) => {
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
        { id: id.roleAdmin, tenantId, code: 'ADMIN', name: 'Administrator',
          permissions: ['*', 'pack:manage', 'period:close', 'period:reopen'] },
        {
          id: id.rolePlantHead, tenantId, code: 'PLANT_HEAD', name: 'Plant Head',
          permissions: [
            'purchase_order:*', 'goods_receipt:*', 'stock:read', 'gate:*',
            // Master data is separate from transactional rights on purpose: a
            // plant head may maintain their own masters, a store executive may not.
            'master_data:read', 'master_data:write',
            // Closing a period is routine month-end work. Reopening one changes
            // figures already reported, so it is a separate permission the
            // administrator holds and the plant head does not.
            'period:close',
          ],
        },
        {
          id: id.roleStores, tenantId, code: 'STORE_EXECUTIVE', name: 'Store Executive',
          permissions: [
            // Can raise an order, cannot approve one. That separation is the point.
            'purchase_order:read', 'purchase_order:submit',
            'goods_receipt:read', 'goods_receipt:post', 'stock:read',
            'gate:read', 'gate:in', 'gate:weigh', 'gate:out',
            'master_data:read',
          ],
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
    const itemIds: Record<string, string> = {}
    const deptIds: Record<string, string> = {}
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
        deptIds[`${factory.code}:${dept}`] = departmentId
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
          // Raised by purchase, so a store executive scoped to STORES does not
          // see it — which is the department restriction being demonstrated.
          departmentId: deptIds[`${factory.code}:PURCHASE`] ?? null,
          orderDate: new Date('2026-09-05'), totalAmount: '0',
        },
      })

      let total = 0
      let lineNo = 0
      for (const spec of factory.items) {
        lineNo++
        const itemId = uid()
        itemIds[spec.code] = itemId
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

      // A second order left in DRAFT, so submit and approve can actually be
      // exercised. Its value crosses the 1,00,000 band on purpose, which is
      // where the approval matrix starts to matter.
      const draftId = uid()
      await tx.purchaseOrder.create({
        data: {
          id: draftId, tenantId, legalEntityId: id.legalEntity, plantId,
          documentNo: null, supplierId: id.supplier, state: 'DRAFT',
          // Left plant-wide on purpose: everyone scoped to the plant can act on
          // it, which is what makes the maker-checker demo reachable.
          departmentId: null,
          orderDate: new Date('2026-09-12'), totalAmount: '0',
        },
      })
      let draftTotal = 0
      let draftLine = 0
      for (const spec of factory.items.slice(0, 2)) {
        draftLine++
        const itemId = itemIds[spec.code]
        if (itemId === undefined) continue
        const quantity = draftLine * 800
        const amount = (quantity * Number(spec.rate)).toFixed(2)
        draftTotal += Number(amount)
        await tx.purchaseOrderLine.create({
          data: {
            tenantId, purchaseOrderId: draftId, lineNo: draftLine, itemId,
            quantity: String(quantity), rate: spec.rate, amount,
          },
        })
      }
      await tx.purchaseOrder.update({
        where: { id: draftId }, data: { totalAmount: draftTotal.toFixed(2) },
      })

      // The released orders above were numbered by hand, so the series has to
      // start after them. Leaving it at 1 made the first real release collide
      // with a seeded number — the kind of defect that only shows up when
      // someone actually uses the feature.
      await tx.numberSeries.updateMany({
        where: { seriesCode: 'PURCHASE_ORDER', fiscalYear: '2026-27' },
        data: { nextValue: poSeq + 1 },
      })
    }

    // ── industry packs ──────────────────────────────────────────────────────
    //
    // Carton is installed and carries data, so the uninstall guard has something
    // to refuse. Textile is deliberately left uninstalled: installing it from
    // the UI is how the plugin behaviour is demonstrated.
    await tx.packInstallation.create({
      data: { tenantId, packId: 'carton', version: '1.0.0', status: 'INSTALLED' },
    })

    const cartonPlant = plantIds['CARTON-01'] ?? ''
    for (const [code, gsm, bf, deckle] of [
      ['RM-KRAFT-180', 180, 22, 1600],
      ['RM-FLUTE-120', 120, 16, 1600],
    ] as const) {
      const itemId = itemIds[code]
      if (itemId !== undefined) {
        await tx.cartonBoardSpec.create({
          data: { tenantId, itemId, gsm, burstFactor: String(bf), deckleMm: deckle, liner: 'Kraft' },
        })
      }
    }
    await tx.cartonBoxStyle.create({
      data: {
        tenantId, code: 'RSC-5PLY-STD', name: '5 Ply RSC Export',
        fefcoCode: '0201', flute: 'BC', ply: 5,
        innerLengthMm: 600, innerWidthMm: 400, innerHeightMm: 400,
      },
    })
    await tx.cartonTool.create({
      data: {
        tenantId, plantId: cartonPlant, code: 'DIE-0201-600', name: 'RSC 600x400x400 rotary die',
        toolType: 'ROTARY_DIE', customerOwned: false, lifeLimit: 500000, currentImpressions: 128400,
        storageLocation: 'Tool Room A',
      },
    })
    await tx.cartonTrimPlan.create({
      data: {
        tenantId, plantId: cartonPlant, documentNo: 'TRIM/2026-27/0001',
        planDate: new Date('2026-09-10'), deckleMm: 1600, trimWasteMm: 42,
        trimWastePct: '2.625',
        combination: [
          { order: 'PO/2026-27/0001', widthMm: 780, ups: 1 },
          { order: 'PO/2026-27/0001', widthMm: 778, ups: 1 },
        ],
      },
    })

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
      '',
      '    Each factory has one RELEASED order and one DRAFT awaiting approval.',
      '    carton.stores can submit but not approve — maker-checker.',
      '    The released order belongs to PURCHASE, so carton.stores cannot see it.',
      '',
      '    Carton pack: INSTALLED, with data (uninstall will be refused).',
      '    Textile pack: not installed — install it from the Industry packs screen.',
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
