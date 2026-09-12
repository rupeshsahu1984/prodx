import { describe, expect, it } from 'vitest'
import { ForbiddenError, SegregationOfDutiesError } from '../auth/permissions'
import { purchaseOrderWorkflow } from './procure-to-pay'
import { InvalidTransitionError } from './state-machine'

const MAKER = 'user-maker'
const CHECKER = 'user-checker'

describe('purchase order workflow', () => {
  it('starts in DRAFT', () => {
    expect(purchaseOrderWorkflow.initial).toBe('DRAFT')
  })

  it('moves DRAFT to PENDING_APPROVAL on submit', () => {
    expect(
      purchaseOrderWorkflow.apply('DRAFT', 'submit', {
        permissions: ['purchase_order:submit'],
        actorId: MAKER,
      }),
    ).toBe('PENDING_APPROVAL')
  })

  it('refuses an action that does not exist from this state', () => {
    expect(() =>
      purchaseOrderWorkflow.apply('DRAFT', 'approve', {
        permissions: ['*'],
        actorId: CHECKER,
      }),
    ).toThrow(InvalidTransitionError)
  })

  it('refuses without the permission', () => {
    expect(() =>
      purchaseOrderWorkflow.apply('DRAFT', 'submit', {
        permissions: ['purchase_order:read'],
        actorId: MAKER,
      }),
    ).toThrow(ForbiddenError)
  })

  it('refuses self-approval even with full permissions', () => {
    // The whole point of maker-checker: a wildcard grant does not let the
    // submitter approve their own document.
    expect(() =>
      purchaseOrderWorkflow.apply('PENDING_APPROVAL', 'approve', {
        permissions: ['*'],
        actorId: MAKER,
        submittedBy: MAKER,
      }),
    ).toThrow(SegregationOfDutiesError)
  })

  it('allows a different approver', () => {
    expect(
      purchaseOrderWorkflow.apply('PENDING_APPROVAL', 'approve', {
        permissions: ['purchase_order:approve'],
        actorId: CHECKER,
        submittedBy: MAKER,
      }),
    ).toBe('APPROVED')
  })

  it('fails loudly when maker-checker is required but no submitter is known', () => {
    // Better to abort than to quietly skip the check because the caller forgot
    // to load the submitter.
    expect(() =>
      purchaseOrderWorkflow.apply('PENDING_APPROVAL', 'approve', {
        permissions: ['*'],
        actorId: CHECKER,
      }),
    ).toThrow(/maker-checker/)
  })

  it('has no path from RELEASED back to DRAFT', () => {
    // Once the supplier holds the order, changes are an amendment, not an edit.
    const actions = purchaseOrderWorkflow.availableFrom('RELEASED').map((t) => t.action)
    expect(actions).toEqual(['close'])
  })

  it('treats CLOSED and CANCELLED as terminal', () => {
    expect(purchaseOrderWorkflow.isTerminal('CLOSED')).toBe(true)
    expect(purchaseOrderWorkflow.isTerminal('CANCELLED')).toBe(true)
    expect(purchaseOrderWorkflow.isTerminal('DRAFT')).toBe(false)
  })

  it('allowedFor hides what the actor cannot do', () => {
    // This is what the UI should render from — not a hardcoded button list.
    const allowed = purchaseOrderWorkflow.allowedFor('PENDING_APPROVAL', {
      permissions: ['purchase_order:approve'],
      actorId: MAKER,
      submittedBy: MAKER,
    })
    expect(allowed).toEqual([])
  })
})
