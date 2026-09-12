import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  isFullyApproved,
  nextPendingStep,
  NoApprovalRuleError,
  resolveApprovalChain,
  type ApprovalRule,
} from './approval-matrix'

const rule = (over: Partial<ApprovalRule> & Pick<ApprovalRule, 'id'>): ApprovalRule => ({
  documentType: 'PURCHASE_ORDER',
  minAmount: new Decimal(0),
  maxAmount: null,
  plantId: null,
  category: null,
  permission: 'purchase_order:approve',
  sequence: 1,
  ...over,
})

const RULES: ApprovalRule[] = [
  rule({ id: 'r1', minAmount: new Decimal(0), maxAmount: new Decimal(100000), sequence: 1 }),
  rule({
    id: 'r2',
    minAmount: new Decimal(100000),
    maxAmount: null,
    sequence: 1,
    permission: 'purchase_order:approve',
  }),
  rule({
    id: 'r3',
    minAmount: new Decimal(100000),
    maxAmount: null,
    sequence: 2,
    permission: 'purchase_order:approve_high_value',
  }),
]

describe('resolveApprovalChain', () => {
  it('picks the band the amount falls in', () => {
    const chain = resolveApprovalChain(RULES, {
      documentType: 'PURCHASE_ORDER',
      amount: new Decimal(50000),
    })
    expect(chain.map((r) => r.id)).toEqual(['r1'])
  })

  it('returns a multi-step chain in sequence order', () => {
    const chain = resolveApprovalChain(RULES, {
      documentType: 'PURCHASE_ORDER',
      amount: new Decimal(250000),
    })
    expect(chain.map((r) => r.id)).toEqual(['r2', 'r3'])
  })

  it('treats the upper bound as exclusive so bands do not overlap', () => {
    // Exactly 100000 belongs to the higher band, not both.
    const chain = resolveApprovalChain(RULES, {
      documentType: 'PURCHASE_ORDER',
      amount: new Decimal(100000),
    })
    expect(chain.map((r) => r.id)).toEqual(['r2', 'r3'])
  })

  it('throws rather than auto-approving when no rule matches', () => {
    // Silently approving an unbudgeted purchase is the worst possible default.
    expect(() =>
      resolveApprovalChain(RULES, { documentType: 'SALES_ORDER', amount: new Decimal(10) }),
    ).toThrow(NoApprovalRuleError)
  })

  it('matches a plant-specific rule only for that plant', () => {
    const scoped = [rule({ id: 'p1', plantId: 'plant-1' })]
    const query = { documentType: 'PURCHASE_ORDER', amount: new Decimal(10) }
    expect(resolveApprovalChain(scoped, { ...query, plantId: 'plant-1' })).toHaveLength(1)
    expect(() => resolveApprovalChain(scoped, { ...query, plantId: 'plant-2' })).toThrow(
      NoApprovalRuleError,
    )
  })
})

describe('chain progress', () => {
  const chain = resolveApprovalChain(RULES, {
    documentType: 'PURCHASE_ORDER',
    amount: new Decimal(250000),
  })

  it('reports the next pending step', () => {
    expect(nextPendingStep(chain, [])?.id).toBe('r2')
    expect(nextPendingStep(chain, [{ ruleId: 'r2' }])?.id).toBe('r3')
    expect(nextPendingStep(chain, [{ ruleId: 'r2' }, { ruleId: 'r3' }])).toBeNull()
  })

  it('is not fully approved until every step has acted', () => {
    expect(isFullyApproved(chain, [{ ruleId: 'r2' }])).toBe(false)
    expect(isFullyApproved(chain, [{ ruleId: 'r2' }, { ruleId: 'r3' }])).toBe(true)
  })

  it('ignores an approval for a rule not in this chain', () => {
    // A rule from a different amount band must not satisfy this document.
    expect(isFullyApproved(chain, [{ ruleId: 'r1' }, { ruleId: 'r2' }])).toBe(false)
  })
})
