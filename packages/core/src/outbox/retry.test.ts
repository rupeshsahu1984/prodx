import { describe, expect, it } from 'vitest'
import { leaseUntil, MAX_ATTEMPTS, nextAttempt } from './retry'

const now = new Date('2026-09-15T10:00:00.000Z')

describe('nextAttempt', () => {
  it('schedules a retry while attempts remain', () => {
    const decision = nextAttempt(1, now, () => 1)
    expect(decision.status).toBe('PENDING')
    expect(decision.exhausted).toBe(false)
    expect(decision.availableAt.getTime()).toBeGreaterThan(now.getTime())
  })

  it('backs off exponentially', () => {
    const delay = (attempts: number) =>
      (nextAttempt(attempts, now, () => 1).availableAt.getTime() - now.getTime()) / 1000
    expect(delay(1)).toBe(2)
    expect(delay(2)).toBe(4)
    expect(delay(5)).toBe(32)
  })

  it('caps the backoff so a recovered endpoint is retried promptly', () => {
    const delay = (nextAttempt(7, now, () => 1).availableAt.getTime() - now.getTime()) / 1000
    expect(delay).toBeLessThanOrEqual(3600)
  })

  it('applies jitter so a backlog does not retry in lockstep', () => {
    // Without this, everything that failed during one outage returns at the
    // same instant and knocks the recovered endpoint over again.
    const low = nextAttempt(6, now, () => 0.01).availableAt.getTime()
    const high = nextAttempt(6, now, () => 1).availableAt.getTime()
    expect(low).toBeLessThan(high)
  })

  it('never schedules in the past, even with zero jitter', () => {
    expect(nextAttempt(5, now, () => 0).availableAt.getTime()).toBeGreaterThan(now.getTime())
  })

  it('parks the message for a human once attempts are exhausted', () => {
    // A permanently malformed payload must surface, not burn the queue forever.
    const decision = nextAttempt(MAX_ATTEMPTS, now)
    expect(decision.status).toBe('DEAD')
    expect(decision.exhausted).toBe(true)
  })
})

describe('leaseUntil', () => {
  it('is in the future so a claimed message is not immediately re-claimed', () => {
    expect(leaseUntil(now).getTime()).toBeGreaterThan(now.getTime())
  })
})
