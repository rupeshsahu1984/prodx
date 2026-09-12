import { describe, expect, it } from 'vitest'
import {
  assertPostable,
  PeriodClosedError,
  PeriodNotFoundError,
  type FiscalPeriodRef,
  type PostingContext,
} from './period-guard'

const date = new Date('2026-09-12T00:00:00Z')
const plain: PostingContext = { canPostAdjustments: false, isAdjustment: false }
const adjuster: PostingContext = { canPostAdjustments: true, isAdjustment: true }

const period = (status: FiscalPeriodRef['status']): FiscalPeriodRef => ({ id: 'p1', status })

describe('assertPostable', () => {
  it('allows an open period', () => {
    expect(() => assertPostable(period('OPEN'), date, plain)).not.toThrow()
  })

  it('refuses a closed period even for a permitted adjuster', () => {
    // CLOSED is absolute. Reopening is a separate, audited action.
    expect(() => assertPostable(period('CLOSED'), date, adjuster)).toThrow(PeriodClosedError)
  })

  it('refuses an ordinary posting into a soft-closed period', () => {
    expect(() => assertPostable(period('SOFT_CLOSED'), date, plain)).toThrow(PeriodClosedError)
  })

  it('allows a permitted adjustment into a soft-closed period', () => {
    expect(() => assertPostable(period('SOFT_CLOSED'), date, adjuster)).not.toThrow()
  })

  it('refuses an adjustment from someone without the permission', () => {
    expect(() =>
      assertPostable(period('SOFT_CLOSED'), date, { canPostAdjustments: false, isAdjustment: true }),
    ).toThrow(PeriodClosedError)
  })

  it('refuses a posting date no period covers', () => {
    expect(() => assertPostable(null, date, adjuster)).toThrow(PeriodNotFoundError)
  })
})
