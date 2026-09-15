import { createHash } from 'node:crypto'

/**
 * Idempotent execution for device and integration endpoints (gap 8).
 *
 * Weighbridges resend over flaky serial links. Gate scanners double-tap.
 * Shop-floor terminals retry on a timeout that the server actually completed.
 * None of those may create a second gate entry, a second weighment or a second
 * stock movement — so a repeat must replay the original response rather than
 * run the work again.
 *
 * Three cases have to be told apart, and the third is the one usually missed:
 *   - same key, same payload, finished  -> replay the stored response
 *   - same key, still running           -> tell the caller to wait, do not run twice
 *   - same key, DIFFERENT payload       -> the client has a bug; refuse loudly
 * Treating the third as a replay would silently discard a real event.
 */

export interface IdempotencyKey {
  tenantId: string
  /** Which device or integration is speaking: WEIGHBRIDGE_01, GATE_SCANNER_A. */
  source: string
  /** That device's own reference for this event. */
  externalRef: string
}

export interface StoredAttempt {
  requestHash: string
  /** Null while the original call is still running. */
  response: unknown | null
}

export interface IdempotencyPort {
  find(key: IdempotencyKey): Promise<StoredAttempt | null>
  /**
   * Must insert atomically and report whether this caller won the race. The
   * unique constraint on (tenant, source, externalRef) is what makes two
   * simultaneous retries safe.
   */
  reserve(key: IdempotencyKey, requestHash: string): Promise<'RESERVED' | 'ALREADY_EXISTS'>
  complete(key: IdempotencyKey, response: unknown): Promise<void>
  release(key: IdempotencyKey): Promise<void>
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: IdempotencyKey) {
    super(
      `Idempotency key "${key.externalRef}" from ${key.source} was already used with a ` +
        'different payload. The same reference must never describe two different events.',
    )
  }
}

export class IdempotencyInFlightError extends Error {
  readonly code = 'IDEMPOTENCY_IN_FLIGHT'
  constructor(key: IdempotencyKey) {
    super(`Reference "${key.externalRef}" is still being processed. Retry shortly.`)
  }
}

/** Stable across key order, so the same payload always hashes the same way. */
export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(canonical(payload)).digest('hex')
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

export interface IdempotentOutcome<T> {
  result: T
  /** True when the work had already been done and the stored response was returned. */
  replayed: boolean
}

export async function runIdempotent<T>(
  port: IdempotencyPort,
  key: IdempotencyKey,
  payload: unknown,
  work: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  const requestHash = hashRequest(payload)

  const existing = await port.find(key)
  if (existing !== null) return replay<T>(existing, key, requestHash)

  if ((await port.reserve(key, requestHash)) === 'ALREADY_EXISTS') {
    // Lost the race to a simultaneous retry. Re-read rather than run.
    const winner = await port.find(key)
    if (winner === null) throw new IdempotencyInFlightError(key)
    return replay<T>(winner, key, requestHash)
  }

  try {
    const result = await work()
    await port.complete(key, result)
    return { result, replayed: false }
  } catch (error) {
    // The work failed, so the key must not block a legitimate retry. Releasing
    // is safe precisely because nothing was committed.
    await port.release(key)
    throw error
  }
}

function replay<T>(
  attempt: StoredAttempt,
  key: IdempotencyKey,
  requestHash: string,
): IdempotentOutcome<T> {
  if (attempt.requestHash !== requestHash) throw new IdempotencyConflictError(key)
  if (attempt.response === null) throw new IdempotencyInFlightError(key)
  return { result: attempt.response as T, replayed: true }
}
