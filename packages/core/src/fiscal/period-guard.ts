/**
 * Fiscal period locks (ADR 0007).
 *
 * There is deliberately no bypass parameter. The only way into a soft-closed
 * period is the adjustment permission; the only way into a closed one is to
 * reopen it, which is an audited action elsewhere.
 */

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED'

export interface FiscalPeriodRef {
  id: string
  status: PeriodStatus
}

export interface PostingContext {
  /** True only when the actor holds the adjustment permission. */
  canPostAdjustments: boolean
  /** Reversals and adjustment journals are the only things a soft-closed period accepts. */
  isAdjustment: boolean
}

export class PeriodClosedError extends Error {
  readonly code = 'FISCAL_PERIOD_CLOSED'
  constructor(status: PeriodStatus) {
    super(
      status === 'CLOSED'
        ? 'The fiscal period is closed. Post to the current open period, referencing the original document date.'
        : 'The fiscal period is soft-closed and accepts only adjustments, which you are not permitted to post.',
    )
  }
}

export class PeriodNotFoundError extends Error {
  readonly code = 'FISCAL_PERIOD_NOT_FOUND'
  constructor(postingDate: Date) {
    super(`No fiscal period covers ${postingDate.toISOString().slice(0, 10)}`)
  }
}

export function assertPostable(
  period: FiscalPeriodRef | null,
  postingDate: Date,
  context: PostingContext,
): void {
  if (period === null) throw new PeriodNotFoundError(postingDate)
  if (period.status === 'OPEN') return
  if (period.status === 'CLOSED') throw new PeriodClosedError('CLOSED')
  if (context.isAdjustment && context.canPostAdjustments) return
  throw new PeriodClosedError('SOFT_CLOSED')
}
