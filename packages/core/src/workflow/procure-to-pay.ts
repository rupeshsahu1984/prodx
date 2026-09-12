import { Workflow, type WorkflowDefinition } from './state-machine'

/**
 * Purchase order lifecycle, taken from the prototype's procurement family:
 * "Draft, Budget / Source Check, Approval, Release to Supplier, Receive / Settle / Close".
 */
export type PurchaseOrderState =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RELEASED'
  | 'CLOSED'
  | 'CANCELLED'

const purchaseOrderDefinition: WorkflowDefinition<PurchaseOrderState> = {
  initial: 'DRAFT',
  transitions: [
    { from: 'DRAFT', to: 'PENDING_APPROVAL', action: 'submit', permission: 'purchase_order:submit' },
    { from: 'DRAFT', to: 'CANCELLED', action: 'cancel', permission: 'purchase_order:cancel' },
    {
      from: 'PENDING_APPROVAL',
      to: 'APPROVED',
      action: 'approve',
      permission: 'purchase_order:approve',
      // Maker-checker. Holding the permission is necessary, never sufficient.
      requiresDifferentPerson: true,
    },
    {
      from: 'PENDING_APPROVAL',
      to: 'DRAFT',
      action: 'reject',
      permission: 'purchase_order:approve',
      requiresDifferentPerson: true,
    },
    { from: 'APPROVED', to: 'RELEASED', action: 'release', permission: 'purchase_order:release' },
    { from: 'APPROVED', to: 'CANCELLED', action: 'cancel', permission: 'purchase_order:cancel' },
    { from: 'RELEASED', to: 'CLOSED', action: 'close', permission: 'purchase_order:close' },
    // No transition out of RELEASED back to DRAFT: once a supplier has the
    // order, changes go through a documented amendment, not a silent edit.
  ],
}

export const purchaseOrderWorkflow = new Workflow(purchaseOrderDefinition)

/**
 * Goods receipt. Shorter, because a receipt is an event rather than a
 * negotiation — but POSTED is terminal, since a posted movement is reversed,
 * never edited (CLAUDE.md invariant 2).
 */
export type GoodsReceiptState = 'DRAFT' | 'POSTED' | 'REVERSED'

const goodsReceiptDefinition: WorkflowDefinition<GoodsReceiptState> = {
  initial: 'DRAFT',
  transitions: [
    { from: 'DRAFT', to: 'POSTED', action: 'post', permission: 'goods_receipt:post' },
    { from: 'POSTED', to: 'REVERSED', action: 'reverse', permission: 'goods_receipt:reverse' },
  ],
}

export const goodsReceiptWorkflow = new Workflow(goodsReceiptDefinition)
