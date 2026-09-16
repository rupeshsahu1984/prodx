/**
 * Retry policy for outbox delivery.
 *
 * Pure, so the decision that governs whether a failed e-way bill is retried in
 * four seconds or parked for a human can be tested without a database or a
 * clock.
 */

export type OutboxStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DEAD'

export interface RetryDecision {
  status: OutboxStatus
  /** When the message becomes eligible again. Ignored once DEAD. */
  availableAt: Date
  /** True when a human has to look at it. */
  exhausted: boolean
}

export const MAX_ATTEMPTS = 8
/** Long enough that a brief outage is invisible, short enough to notice. */
export const LEASE_SECONDS = 60
const MAX_BACKOFF_SECONDS = 3600

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters more than it looks: without it, every message that failed
 * during the same outage retries at the same instant, and the endpoint that
 * just came back gets the whole backlog at once — which knocks it over again.
 */
export function nextAttempt(attempts: number, now: Date, random = Math.random): RetryDecision {
  if (attempts >= MAX_ATTEMPTS) {
    return { status: 'DEAD', availableAt: now, exhausted: true }
  }
  const ceiling = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS)
  const delay = Math.max(1, Math.round(ceiling * random()))
  return {
    status: 'PENDING',
    availableAt: new Date(now.getTime() + delay * 1000),
    exhausted: false,
  }
}

/**
 * When a claim expires.
 *
 * Claiming leases a message rather than marking it sent: a worker killed
 * between claiming and delivering must not leave the message looking delivered.
 * The lease simply lapses and another worker picks it up.
 */
export const leaseUntil = (now: Date): Date => new Date(now.getTime() + LEASE_SECONDS * 1000)
