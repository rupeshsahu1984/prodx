import { describe, expect, it, vi } from 'vitest'
import {
  hashRequest,
  IdempotencyConflictError,
  IdempotencyInFlightError,
  runIdempotent,
  type IdempotencyKey,
  type IdempotencyPort,
  type StoredAttempt,
} from './idempotent'

const key: IdempotencyKey = {
  tenantId: 't1',
  source: 'WEIGHBRIDGE_01',
  externalRef: 'WB-2026-09-15-0042',
}

/** In-memory port with the same uniqueness guarantee the database provides. */
function fakePort(seed: StoredAttempt | null = null) {
  let stored: StoredAttempt | null = seed
  return {
    port: {
      find: async () => stored,
      reserve: async (_k: IdempotencyKey, requestHash: string) => {
        if (stored !== null) return 'ALREADY_EXISTS' as const
        stored = { requestHash, response: null }
        return 'RESERVED' as const
      },
      complete: async (_k: IdempotencyKey, response: unknown) => {
        stored = { requestHash: stored?.requestHash ?? '', response }
      },
      release: async () => {
        stored = null
      },
    } satisfies IdempotencyPort,
    peek: () => stored,
  }
}

describe('hashRequest', () => {
  it('is stable across key order', () => {
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }))
  })

  it('distinguishes different payloads', () => {
    expect(hashRequest({ gross: 18500 })).not.toBe(hashRequest({ gross: 18510 }))
  })

  it('ignores undefined but not null', () => {
    expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }))
    expect(hashRequest({ a: 1, b: null })).not.toBe(hashRequest({ a: 1 }))
  })

  it('is stable for nested structures', () => {
    expect(hashRequest({ x: [{ p: 1, q: 2 }] })).toBe(hashRequest({ x: [{ q: 2, p: 1 }] }))
  })
})

describe('runIdempotent', () => {
  it('runs the work the first time', async () => {
    const { port } = fakePort()
    const work = vi.fn().mockResolvedValue({ ticketId: 'wb-1' })
    const outcome = await runIdempotent(port, key, { gross: 18500 }, work)
    expect(outcome).toEqual({ result: { ticketId: 'wb-1' }, replayed: false })
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('replays the stored response on a repeat, without running again', async () => {
    // The weighbridge resending over a flaky link must not create a second ticket.
    const { port } = fakePort()
    const work = vi.fn().mockResolvedValue({ ticketId: 'wb-1' })
    await runIdempotent(port, key, { gross: 18500 }, work)
    const second = await runIdempotent(port, key, { gross: 18500 }, work)

    expect(second.replayed).toBe(true)
    expect(second.result).toEqual({ ticketId: 'wb-1' })
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('refuses the same key with a different payload', async () => {
    // The case usually missed: treating this as a replay would silently discard
    // a real weighment.
    const { port } = fakePort()
    await runIdempotent(port, key, { gross: 18500 }, async () => ({ ticketId: 'wb-1' }))
    await expect(
      runIdempotent(port, key, { gross: 19900 }, async () => ({ ticketId: 'wb-2' })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError)
  })

  it('reports an in-flight original rather than running twice', async () => {
    const { port } = fakePort({ requestHash: hashRequest({ gross: 18500 }), response: null })
    const work = vi.fn()
    await expect(runIdempotent(port, key, { gross: 18500 }, work)).rejects.toBeInstanceOf(
      IdempotencyInFlightError,
    )
    expect(work).not.toHaveBeenCalled()
  })

  it('does not run the work when it loses the reserve race', async () => {
    // Two retries arrive together; the loser must replay, never re-execute.
    let stored: StoredAttempt | null = null
    const work = vi.fn().mockResolvedValue({ ticketId: 'wb-2' })
    const port: IdempotencyPort = {
      find: async () => stored,
      reserve: async () => {
        // Another caller committed between our find and our reserve.
        stored = { requestHash: hashRequest({ gross: 18500 }), response: { ticketId: 'wb-1' } }
        return 'ALREADY_EXISTS'
      },
      complete: async () => undefined,
      release: async () => undefined,
    }
    const outcome = await runIdempotent(port, key, { gross: 18500 }, work)
    expect(outcome).toEqual({ result: { ticketId: 'wb-1' }, replayed: true })
    expect(work).not.toHaveBeenCalled()
  })

  it('releases the key when the work fails, so a genuine retry can proceed', async () => {
    const { port, peek } = fakePort()
    await expect(
      runIdempotent(port, key, { gross: 18500 }, async () => {
        throw new Error('scale offline')
      }),
    ).rejects.toThrow('scale offline')
    expect(peek()).toBeNull()

    const outcome = await runIdempotent(port, key, { gross: 18500 }, async () => ({ ok: true }))
    expect(outcome.replayed).toBe(false)
  })
})
