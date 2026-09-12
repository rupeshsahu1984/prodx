import Decimal from 'decimal.js'
import type { Permission } from '../auth/permissions'

/**
 * Approval thresholds (gap 11). The prototype shows "Approval threshold ○" as
 * an unchecked box; this is what sits behind it.
 *
 * Rules are matched on document type, amount band and optionally plant or
 * category. The result is an ordered chain: every step must approve, in order.
 */

export interface ApprovalRule {
  id: string
  documentType: string
  /** Inclusive lower bound. */
  minAmount: Decimal
  /** Exclusive upper bound; null means unbounded. */
  maxAmount: Decimal | null
  plantId?: string | null
  category?: string | null
  /** Permission an approver must hold at this step. */
  permission: Permission
  /** Position in the chain; lower approves first. */
  sequence: number
}

export interface ApprovalQuery {
  documentType: string
  amount: Decimal
  plantId?: string | null
  category?: string | null
}

export class NoApprovalRuleError extends Error {
  readonly code = 'NO_APPROVAL_RULE'
  constructor(query: ApprovalQuery) {
    super(
      `No approval rule covers ${query.documentType} at ${query.amount.toString()}. ` +
        'Configure the approval matrix before submitting.',
    )
  }
}

const applies = (rule: ApprovalRule, query: ApprovalQuery): boolean => {
  if (rule.documentType !== query.documentType) return false
  if (query.amount.lessThan(rule.minAmount)) return false
  if (rule.maxAmount !== null && query.amount.greaterThanOrEqualTo(rule.maxAmount)) return false
  // A null on the rule means "any"; a value must match exactly.
  if (rule.plantId != null && rule.plantId !== query.plantId) return false
  if (rule.category != null && rule.category !== query.category) return false
  return true
}

/**
 * Returns the ordered chain of steps.
 *
 * Throws when nothing matches rather than defaulting to auto-approval. A gap in
 * the matrix must block the document and be fixed in configuration — silently
 * approving an unbudgeted purchase is the worst possible default.
 */
export function resolveApprovalChain(
  rules: readonly ApprovalRule[],
  query: ApprovalQuery,
): ApprovalRule[] {
  const matched = rules.filter((rule) => applies(rule, query))
  if (matched.length === 0) throw new NoApprovalRuleError(query)

  return [...matched].sort((a, b) =>
    a.sequence === b.sequence ? a.id.localeCompare(b.id) : a.sequence - b.sequence,
  )
}

/** True when every step in the chain has an approval recorded. */
export function isFullyApproved(
  chain: readonly ApprovalRule[],
  approvals: ReadonlyArray<{ ruleId: string }>,
): boolean {
  const approved = new Set(approvals.map((a) => a.ruleId))
  return chain.every((step) => approved.has(step.id))
}

/** The next step awaiting action, or null when the chain is complete. */
export function nextPendingStep(
  chain: readonly ApprovalRule[],
  approvals: ReadonlyArray<{ ruleId: string }>,
): ApprovalRule | null {
  const approved = new Set(approvals.map((a) => a.ruleId))
  return chain.find((step) => !approved.has(step.id)) ?? null
}
