import Decimal from 'decimal.js'

/**
 * Moving weighted average valuation (ADR 0005).
 *
 * Pure functions over a valuation state. The caller persists the returned state
 * in the same transaction as the stock ledger insert — valuation and ledger must
 * never be able to disagree.
 */

export const QUANTITY_DP = 6
export const UNIT_COST_DP = 6
export const VALUE_DP = 2

export interface ValuationState {
  quantityOnHand: Decimal
  totalValue: Decimal
  unitCost: Decimal
}

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK'
  constructor(available: Decimal, requested: Decimal) {
    super(`Requested ${requested.toString()} but only ${available.toString()} is on hand`)
  }
}

export const emptyValuation = (): ValuationState => ({
  quantityOnHand: new Decimal(0),
  totalValue: new Decimal(0),
  unitCost: new Decimal(0),
})

const round = (value: Decimal, dp: number): Decimal =>
  value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP)

/** Receipt: quantity and value both increase; unit cost is re-derived. */
export function applyReceipt(
  state: ValuationState,
  quantity: Decimal,
  value: Decimal,
): ValuationState {
  const quantityOnHand = round(state.quantityOnHand.plus(quantity), QUANTITY_DP)
  const totalValue = round(state.totalValue.plus(value), VALUE_DP)

  return {
    quantityOnHand,
    totalValue,
    unitCost: quantityOnHand.isZero()
      ? state.unitCost
      : round(totalValue.div(quantityOnHand), UNIT_COST_DP),
  }
}

/**
 * Issue: value leaves at the *current* unit cost, which is what makes this a
 * moving average rather than a recalculation.
 *
 * The subtle part is the zero case. Issuing at a rounded unit cost leaves a few
 * paise of residual value behind, and on an item that cycles to empty repeatedly
 * that residue accumulates as value with no quantity — which shows up months
 * later as an unexplainable gap between the stock valuation report and the GL.
 * So when quantity reaches zero, the remaining value is written off into this
 * movement rather than carried.
 */
export function applyIssue(
  state: ValuationState,
  quantity: Decimal,
  options: { allowNegative: boolean } = { allowNegative: false },
): { state: ValuationState; issuedValue: Decimal } {
  const quantityOnHand = round(state.quantityOnHand.minus(quantity), QUANTITY_DP)

  if (quantityOnHand.isNegative() && !options.allowNegative) {
    throw new InsufficientStockError(state.quantityOnHand, quantity)
  }

  if (quantityOnHand.isZero()) {
    return {
      state: {
        quantityOnHand,
        totalValue: new Decimal(0),
        unitCost: state.unitCost,
      },
      issuedValue: state.totalValue,
    }
  }

  const issuedValue = round(quantity.times(state.unitCost), VALUE_DP)
  const totalValue = round(state.totalValue.minus(issuedValue), VALUE_DP)

  return {
    state: {
      quantityOnHand,
      totalValue,
      unitCost: round(totalValue.div(quantityOnHand), UNIT_COST_DP),
    },
    issuedValue,
  }
}
