import { ALL_PACKS, ALL_PLANTS, platformScope, prisma, withScope, type DbScope } from '@prodx/db'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { PurchasingService, type Actor } from '../src/purchasing/purchasing.service'
import { seedScenario } from './seed'

const purchasing = new PurchasingService()
const scopeFor = (tenantId: string): DbScope => ({ tenantId, plants: ALL_PLANTS, packs: ALL_PACKS })

const MAKER = randomUUID()
const CHECKER = randomUUID()

const actor = (tenantId: string, id: string, permissions: string[]): Actor => ({
  actorId: id,
  permissions,
  scope: scopeFor(tenantId),
})

/** The seeded order is RELEASED; approval needs one in DRAFT. */
async function draftOrder(tenantId: string, purchaseOrderId: string): Promise<void> {
  await withScope(platformScope(tenantId), (tx) =>
    tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { state: 'DRAFT', documentNo: null, submittedById: null },
    }),
  )
}

async function addRule(tenantId: string, over: Record<string, unknown> = {}): Promise<void> {
  await withScope(platformScope(tenantId), (tx) =>
    tx.approvalRule.create({
      data: {
        tenantId,
        documentType: 'PURCHASE_ORDER',
        minAmount: '0',
        maxAmount: null,
        permission: 'purchase_order:approve',
        sequence: 1,
        ...over,
      },
    }),
  )
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('purchase order approval', () => {
  it('moves DRAFT to PENDING_APPROVAL and records the submitter', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)

    const result = await purchasing.submit(
      s.purchaseOrderId,
      actor(s.tenantId, MAKER, ['purchase_order:submit']),
    )
    expect(result.state).toBe('PENDING_APPROVAL')

    const po = await withScope(platformScope(s.tenantId), (tx) =>
      tx.purchaseOrder.findUniqueOrThrow({ where: { id: s.purchaseOrderId } }),
    )
    expect(po.submittedById).toBe(MAKER)
  })

  it('refuses to submit without the permission', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)
    await expect(
      purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:read'])),
    ).rejects.toThrow(/purchase_order:submit/)
  })

  it('refuses to submit when no approval rule covers the value', async () => {
    // Auto-approving an unbudgeted purchase is the worst possible default, so
    // a gap in the matrix must block the document.
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await expect(
      purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit'])),
    ).rejects.toThrow(/approval rule/i)
  })

  it('refuses self-approval even with every permission', async () => {
    // Maker-checker end to end: holding the approve right is necessary, never
    // sufficient.
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['*']))

    await expect(
      purchasing.approve(s.purchaseOrderId, actor(s.tenantId, MAKER, ['*'])),
    ).rejects.toThrow(/cannot approve a document you submitted/i)
  })

  it('approves when a different person acts', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))

    const result = await purchasing.approve(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:approve']),
    )
    expect(result).toEqual({ state: 'APPROVED', remainingSteps: 0 })
  })

  it('requires every step of a two-step chain', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId, { sequence: 1 })
    await addRule(s.tenantId, { sequence: 2, permission: 'purchase_order:approve_high_value' })
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))

    const first = await purchasing.approve(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:approve']),
    )
    expect(first).toEqual({ state: 'PENDING_APPROVAL', remainingSteps: 1 })

    // The second step demands an authority the first approver does not hold.
    await expect(
      purchasing.approve(s.purchaseOrderId, actor(s.tenantId, CHECKER, ['purchase_order:approve'])),
    ).rejects.toThrow(/purchase_order:approve_high_value/)

    const second = await purchasing.approve(
      s.purchaseOrderId,
      actor(s.tenantId, randomUUID(), ['purchase_order:approve_high_value']),
    )
    expect(second.state).toBe('APPROVED')
  })

  it('keeps approval records on rejection but stops them counting', async () => {
    // The record is append-only — who approved what stays a fact. What changes
    // is the cycle, so the next submission starts from zero signatures.
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId, { sequence: 1 })
    await addRule(s.tenantId, { sequence: 2, permission: 'purchase_order:approve_high_value' })
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))
    await purchasing.approve(s.purchaseOrderId, actor(s.tenantId, CHECKER, ['purchase_order:approve']))

    const rejected = await purchasing.reject(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:approve']),
    )
    expect(rejected.state).toBe('DRAFT')

    const records = await withScope(platformScope(s.tenantId), (tx) =>
      tx.approvalRecord.count({ where: { documentId: s.purchaseOrderId } }),
    )
    expect(records).toBe(1)

    // Resubmitted, the earlier signature does not carry over.
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))
    const steps = await purchasing.approvalState(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:read']),
    )
    expect(steps.every((step) => step.approvedById === null)).toBe(true)
  })

  it('allocates the document number on release, not before', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))
    await purchasing.approve(s.purchaseOrderId, actor(s.tenantId, CHECKER, ['purchase_order:approve']))

    await withScope(platformScope(s.tenantId), (tx) =>
      tx.numberSeries.create({
        data: {
          tenantId: s.tenantId,
          legalEntityId: s.legalEntityId,
          seriesCode: 'PURCHASE_ORDER',
          fiscalYear: '2026-27',
          format: 'PO/{FY}/{####}',
          nextValue: 1,
        },
      }),
    )
    const released = await purchasing.release(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:release']),
    )
    expect(released).toMatchObject({ state: 'RELEASED', documentNo: 'PO/2026-27/0001' })
  })

  it('refuses an action the state does not allow', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId)
    await expect(
      purchasing.approve(s.purchaseOrderId, actor(s.tenantId, CHECKER, ['*'])),
    ).rejects.toThrow(/not awaiting approval/i)
  })

  it('reports who has signed and who is next', async () => {
    const s = await seedScenario()
    await draftOrder(s.tenantId, s.purchaseOrderId)
    await addRule(s.tenantId, { sequence: 1 })
    await addRule(s.tenantId, { sequence: 2, permission: 'purchase_order:approve_high_value' })
    await purchasing.submit(s.purchaseOrderId, actor(s.tenantId, MAKER, ['purchase_order:submit']))
    await purchasing.approve(s.purchaseOrderId, actor(s.tenantId, CHECKER, ['purchase_order:approve']))

    const steps = await purchasing.approvalState(
      s.purchaseOrderId,
      actor(s.tenantId, CHECKER, ['purchase_order:read']),
    )
    expect(steps).toHaveLength(2)
    expect(steps[0]?.approvedById).toBe(CHECKER)
    expect(steps[1]?.approvedById).toBeNull()
  })
})
