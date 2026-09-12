import { describe, expect, it } from 'vitest'
import {
  assertDifferentPerson,
  assertPermission,
  ForbiddenError,
  hasPermission,
  SegregationOfDutiesError,
} from './permissions'

describe('hasPermission', () => {
  it('matches exactly', () => {
    expect(hasPermission(['purchase_order:approve'], 'purchase_order:approve')).toBe(true)
    expect(hasPermission(['purchase_order:read'], 'purchase_order:approve')).toBe(false)
  })

  it('expands a domain wildcard', () => {
    expect(hasPermission(['purchase_order:*'], 'purchase_order:approve')).toBe(true)
  })

  it('does not let a wildcard cross a segment boundary', () => {
    // The bug this guards: a prefix match would make purchase_order:* grant
    // purchase_order_draft:read, a different domain entirely.
    expect(hasPermission(['purchase_order:*'], 'purchase_order_draft:read')).toBe(false)
    expect(hasPermission(['purchase_order:*'], 'purchase_order:approve:override')).toBe(false)
  })

  it('honours a global wildcard', () => {
    expect(hasPermission(['*'], 'anything:at:all')).toBe(true)
  })

  it('denies when nothing is granted', () => {
    expect(hasPermission([], 'purchase_order:read')).toBe(false)
  })

  it('throws ForbiddenError naming the permission, not the record', () => {
    expect(() => assertPermission([], 'purchase_order:approve')).toThrow(ForbiddenError)
    expect(() => assertPermission([], 'purchase_order:approve')).toThrow(/purchase_order:approve/)
  })
})

describe('segregation of duties', () => {
  it('refuses self-approval', () => {
    expect(() => assertDifferentPerson('user-1', 'user-1')).toThrow(SegregationOfDutiesError)
  })

  it('allows a different approver', () => {
    expect(() => assertDifferentPerson('user-1', 'user-2')).not.toThrow()
  })
})
