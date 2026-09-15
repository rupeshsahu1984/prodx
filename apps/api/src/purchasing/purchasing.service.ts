import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  allocateDocumentNumber,
  assertPermission,
  nextPendingStep,
  purchaseOrderWorkflow,
  resolveApprovalChain,
  type ApprovalRule,
  type PurchaseOrderState,
} from '@prodx/core'
import { withScope, type DbScope } from '@prodx/db'
import Decimal from 'decimal.js'
import { PrismaNumberSeriesAdapter } from '../numbering/number-series.adapter'

export interface Actor {
  actorId: string
  permissions: readonly string[]
  scope: DbScope
}

export interface ApprovalStepView {
  ruleId: string
  sequence: number
  permission: string
  approvedById: string | null
  approvedAt: Date | null
}

/**
 * Purchase order lifecycle.
 *
 * All the rules live in engines — the state machine decides what may happen,
 * the approval matrix decides who must sign, and segregation of duties decides
 * who may not. This service only moves data and keeps it in one transaction.
 */
@Injectable()
export class PurchasingService {
  async submit(purchaseOrderId: string, actor: Actor): Promise<{ state: PurchaseOrderState }> {
    return withScope(actor.scope, async (tx) => {
      const po = await this.load(tx, purchaseOrderId)

      const next = purchaseOrderWorkflow.apply(po.state as PurchaseOrderState, 'submit', {
        permissions: actor.permissions,
        actorId: actor.actorId,
      })

      // Resolved at submission, not at approval: the chain must reflect the
      // value the approver is being asked to sign for, and an amount changed
      // afterwards has to go back through submit.
      const chain = resolveApprovalChain(await this.rules(tx), {
        documentType: 'PURCHASE_ORDER',
        amount: new Decimal(po.totalAmount.toString()),
        plantId: po.plantId,
      })
      if (chain.length === 0) {
        throw new BadRequestException({
          code: 'NO_APPROVAL_RULE',
          message: 'No approval rule covers this value.',
        })
      }

      await this.transition(tx, po, next, {
        submittedById: actor.actorId,
        submittedAt: new Date(),
        // A resubmission starts a new cycle, so approvals from the rejected
        // round stop counting without being erased.
        approvalCycle: po.approvalCycle + (po.submittedAt === null ? 0 : 1),
      })
      return { state: next }
    })
  }

  async approve(
    purchaseOrderId: string,
    actor: Actor,
    comment?: string,
  ): Promise<{ state: PurchaseOrderState; remainingSteps: number }> {
    return withScope(actor.scope, async (tx) => {
      const po = await this.load(tx, purchaseOrderId)
      if (po.state !== 'PENDING_APPROVAL') {
        throw new ConflictException({
          code: 'NOT_PENDING_APPROVAL',
          message: `This order is ${po.state} and is not awaiting approval.`,
        })
      }

      const chain = resolveApprovalChain(await this.rules(tx), {
        documentType: 'PURCHASE_ORDER',
        amount: new Decimal(po.totalAmount.toString()),
        plantId: po.plantId,
      })
      const approvals = await tx.approvalRecord.findMany({
        where: {
          documentType: 'PURCHASE_ORDER',
          documentId: po.id,
          cycle: po.approvalCycle,
        },
      })
      const step = nextPendingStep(chain, approvals)
      if (step === null) {
        throw new ConflictException({
          code: 'ALREADY_APPROVED',
          message: 'Every approval step is already complete.',
        })
      }

      // The step's own permission, not a blanket approve right: a high-value
      // band can demand an authority an ordinary approver does not hold.
      assertPermission(actor.permissions, step.permission)

      // Authority was just established from the matrix above, so this validates
      // only the transition and maker-checker. Throws SegregationOfDutiesError
      // when the submitter tries to approve their own order.
      purchaseOrderWorkflow.applyAuthorised('PENDING_APPROVAL', 'approve', {
        actorId: actor.actorId,
        submittedBy: po.submittedById ?? undefined,
      })

      await tx.approvalRecord.create({
        data: {
          tenantId: po.tenantId,
          documentType: 'PURCHASE_ORDER',
          documentId: po.id,
          ruleId: step.id,
          approvedById: actor.actorId,
          cycle: po.approvalCycle,
          comment: comment ?? null,
        },
      })

      const remaining = chain.length - approvals.length - 1
      if (remaining > 0) return { state: 'PENDING_APPROVAL', remainingSteps: remaining }

      await this.transition(tx, po, 'APPROVED', {})
      return { state: 'APPROVED', remainingSteps: 0 }
    })
  }

  async reject(purchaseOrderId: string, actor: Actor): Promise<{ state: PurchaseOrderState }> {
    return withScope(actor.scope, async (tx) => {
      const po = await this.load(tx, purchaseOrderId)
      const next = purchaseOrderWorkflow.apply(po.state as PurchaseOrderState, 'reject', {
        permissions: actor.permissions,
        actorId: actor.actorId,
        submittedBy: po.submittedById ?? undefined,
      })
      // Approvals are NOT deleted — the record is append-only, and who approved
      // what remains a fact. Advancing the cycle is what stops them counting
      // towards the next submission.
      await this.transition(tx, po, next, {
        submittedById: null,
        submittedAt: null,
        approvalCycle: po.approvalCycle + 1,
      })
      return { state: next }
    })
  }

  /** Releasing is where the order gets its number and becomes the supplier's copy. */
  async release(
    purchaseOrderId: string,
    actor: Actor,
  ): Promise<{ state: PurchaseOrderState; documentNo: string }> {
    return withScope(actor.scope, async (tx) => {
      const po = await this.load(tx, purchaseOrderId)
      const next = purchaseOrderWorkflow.apply(po.state as PurchaseOrderState, 'release', {
        permissions: actor.permissions,
        actorId: actor.actorId,
      })

      const documentNo =
        po.documentNo !== null
          ? po.documentNo
          : await allocateDocumentNumber(new PrismaNumberSeriesAdapter(tx), {
              tenantId: po.tenantId,
              legalEntityId: po.legalEntityId,
              seriesCode: 'PURCHASE_ORDER',
              fiscalYear: this.fiscalYear(po.orderDate),
            })

      await this.transition(tx, po, next, { documentNo })
      return { state: next, documentNo }
    })
  }

  /** What the UI needs to show who has signed and who is next. */
  async approvalState(purchaseOrderId: string, actor: Actor): Promise<ApprovalStepView[]> {
    return withScope(actor.scope, async (tx) => {
      const po = await this.load(tx, purchaseOrderId)
      const chain = resolveApprovalChain(await this.rules(tx), {
        documentType: 'PURCHASE_ORDER',
        amount: new Decimal(po.totalAmount.toString()),
        plantId: po.plantId,
      })
      const approvals = await tx.approvalRecord.findMany({
        where: {
          documentType: 'PURCHASE_ORDER',
          documentId: po.id,
          cycle: po.approvalCycle,
        },
      })
      return chain.map((step) => {
        const done = approvals.find((a) => a.ruleId === step.id)
        return {
          ruleId: step.id,
          sequence: step.sequence,
          permission: step.permission,
          approvedById: done?.approvedById ?? null,
          approvedAt: done?.createdAt ?? null,
        }
      })
    })
  }

  private fiscalYear(date: Date): string {
    const year = date.getUTCFullYear()
    const start = date.getUTCMonth() >= 3 ? year : year - 1
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
  }

  private async load(tx: Parameters<Parameters<typeof withScope>[1]>[0], id: string) {
    const po = await tx.purchaseOrder.findUnique({ where: { id } })
    if (po === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found.' })
    }
    return po
  }

  private async rules(
    tx: Parameters<Parameters<typeof withScope>[1]>[0],
  ): Promise<ApprovalRule[]> {
    const rows = await tx.approvalRule.findMany({ where: { documentType: 'PURCHASE_ORDER' } })
    return rows.map((r) => ({
      id: r.id,
      documentType: r.documentType,
      minAmount: new Decimal(r.minAmount.toString()),
      maxAmount: r.maxAmount === null ? null : new Decimal(r.maxAmount.toString()),
      plantId: r.plantId,
      category: r.category,
      permission: r.permission,
      sequence: r.sequence,
    }))
  }

  /** Every state change is version-checked, so a concurrent edit loses cleanly. */
  private async transition(
    tx: Parameters<Parameters<typeof withScope>[1]>[0],
    po: { id: string; version: number },
    state: PurchaseOrderState,
    extra: Record<string, unknown>,
  ): Promise<void> {
    const updated = await tx.purchaseOrder.updateMany({
      where: { id: po.id, version: po.version },
      data: { state, version: { increment: 1 }, ...extra },
    })
    if (updated.count === 0) {
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'The order changed while you were working on it. Reload and try again.',
      })
    }
  }
}
