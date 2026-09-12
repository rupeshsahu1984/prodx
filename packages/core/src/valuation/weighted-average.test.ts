import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  applyIssue,
  applyReceipt,
  emptyValuation,
  InsufficientStockError,
} from './weighted-average'

const d = (n: string | number) => new Decimal(n)

describe('moving weighted average', () => {
  it('sets unit cost from the first receipt', () => {
    const s = applyReceipt(emptyValuation(), d(100), d(2500))
    expect(s.quantityOnHand.toString()).toBe('100')
    expect(s.unitCost.toString()).toBe('25')
  })

  it('averages across receipts at different prices', () => {
    let s = applyReceipt(emptyValuation(), d(100), d(2500)) // 25.00
    s = applyReceipt(s, d(100), d(3500))                    // 35.00
    expect(s.totalValue.toString()).toBe('6000')
    expect(s.unitCost.toString()).toBe('30')
  })

  it('issues at the current average and leaves it unchanged', () => {
    let s = applyReceipt(emptyValuation(), d(100), d(2500))
    s = applyReceipt(s, d(100), d(3500))
    const { state, issuedValue } = applyIssue(s, d(50))
    expect(issuedValue.toString()).toBe('1500')
    expect(state.quantityOnHand.toString()).toBe('150')
    expect(state.unitCost.toString()).toBe('30')
  })

  it('refuses to issue more than is on hand', () => {
    const s = applyReceipt(emptyValuation(), d(10), d(100))
    expect(() => applyIssue(s, d(11))).toThrow(InsufficientStockError)
  })

  it('allows negative stock only when the plant permits it', () => {
    const s = applyReceipt(emptyValuation(), d(10), d(100))
    expect(() => applyIssue(s, d(11), { allowNegative: true })).not.toThrow()
  })

  it('leaves no residual value when stock cycles to zero', () => {
    // 3 units at 10.00 gives a unit cost of 3.333333. Issuing all three at that
    // rounded cost would strand a fraction of a rupee as value with no quantity.
    // Repeated over months, that residue is the classic unexplained gap between
    // the stock valuation report and the inventory GL account.
    let s = applyReceipt(emptyValuation(), d(3), d(10))
    expect(s.unitCost.toString()).toBe('3.333333')

    const { state, issuedValue } = applyIssue(s, d(3))
    expect(state.quantityOnHand.isZero()).toBe(true)
    expect(state.totalValue.toString()).toBe('0')
    expect(issuedValue.toString()).toBe('10')
  })

  it('keeps value and quantity consistent over a long cycle', () => {
    let s = emptyValuation()
    for (let i = 0; i < 50; i++) {
      s = applyReceipt(s, d(7), d(23.37))
      s = applyIssue(s, d(3)).state
    }
    // Whatever the rounding path, value must equal quantity x unit cost to the paisa.
    const implied = s.quantityOnHand.times(s.unitCost).toDecimalPlaces(2)
    expect(implied.minus(s.totalValue).abs().lessThanOrEqualTo(d('0.05'))).toBe(true)
  })
})
