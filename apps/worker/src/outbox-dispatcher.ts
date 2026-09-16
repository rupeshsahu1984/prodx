import { leaseUntil, nextAttempt } from '@prodx/core'
import { PrismaClient } from '@prodx/db'
import { registry, UnhandledTopicError, type HandlerRegistry } from './handlers'

/**
 * The worker's own connection, as prodx_worker.
 *
 * It cannot use the request-path client: that connects as prodx_app, and a
 * connection with no tenant context sees nothing under RLS — including as the
 * owner, because every table is FORCEd. The worker has to find work before it
 * knows whose work it is, so it needs the deliberate cross-tenant role from
 * ADR 0002. Falling back to DATABASE_URL would reintroduce the silent
 * delivers-nothing bug, so a missing URL is a startup failure instead.
 */
const workerUrl = process.env['DATABASE_WORKER_URL']
if (workerUrl === undefined || workerUrl === '') {
  throw new Error(
    'DATABASE_WORKER_URL must be set. The outbox worker needs the cross-tenant ' +
      'role; with the application role it would see no messages and deliver nothing.',
  )
}
export const workerPrisma: PrismaClient = new PrismaClient({
  datasources: { db: { url: workerUrl } },
})

/**
 * Transactional outbox delivery (gap 9).
 *
 * External calls never happen inside a database transaction. The business
 * transaction commits its intent to outbox_message; this loop delivers it.
 *
 * Claiming LEASES a message: attempts is incremented and available_at is pushed
 * into the future, while the status stays PENDING. An earlier version marked it
 * SENT at claim time, which meant a worker killed between claiming and
 * delivering left the message looking delivered forever — the one failure mode
 * an outbox exists to prevent. If this process dies now, the lease simply
 * lapses and another worker picks the message up.
 *
 * SKIP LOCKED lets several workers run without ever handing the same message to
 * two of them.
 */
const BATCH_SIZE = 20

export interface DispatchSummary {
  claimed: number
  delivered: number
  retried: number
  dead: number
}

export async function dispatchOutboxBatch(
  handlers: HandlerRegistry = registry,
  now: Date = new Date(),
): Promise<DispatchSummary> {
  const claimed = await workerPrisma.$queryRaw<
    Array<{ id: string; topic: string; payload: unknown; attempts: number }>
  >`
    UPDATE outbox_message
       SET attempts = attempts + 1, available_at = ${leaseUntil(now)}
     WHERE id IN (
       SELECT id FROM outbox_message
        WHERE status = 'PENDING' AND available_at <= ${now}
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
     )
    RETURNING id, topic, payload, attempts
  `

  const summary: DispatchSummary = { claimed: claimed.length, delivered: 0, retried: 0, dead: 0 }

  for (const message of claimed) {
    try {
      await handlers.deliver(message.topic, message.payload)
      await workerPrisma.outboxMessage.update({
        where: { id: message.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      })
      summary.delivered++
    } catch (error) {
      const unroutable = error instanceof UnhandledTopicError
      const decision = unroutable
        ? { status: 'DEAD' as const, availableAt: now, exhausted: true }
        : nextAttempt(message.attempts, now)

      await workerPrisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: decision.status,
          availableAt: decision.availableAt,
          lastError: error instanceof Error ? error.message : String(error),
        },
      })
      if (decision.exhausted) summary.dead++
      else summary.retried++
    }
  }

  return summary
}
