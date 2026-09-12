import { prisma } from '@prodx/db'

/**
 * Transactional outbox delivery (gap 9).
 *
 * External calls never happen inside a database transaction. The business
 * transaction commits its intent to outbox_message; this loop delivers it.
 *
 * Two properties matter and are easy to lose:
 *  - Claiming uses SKIP LOCKED so several workers can run without double-sending.
 *  - Delivery is retried with backoff and eventually parked as DEAD rather than
 *    retried forever, because a permanently malformed e-way bill payload must
 *    surface to a human instead of burning the queue.
 */

const MAX_ATTEMPTS = 8
const BATCH_SIZE = 20

export type Deliver = (topic: string, payload: unknown) => Promise<void>

export async function dispatchOutboxBatch(deliver: Deliver): Promise<number> {
  const claimed = await prisma.$queryRaw<Array<{ id: string; topic: string; payload: unknown }>>`
    UPDATE outbox_message
       SET status = 'SENT', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM outbox_message
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
     )
    RETURNING id, topic, payload
  `

  for (const message of claimed) {
    try {
      await deliver(message.topic, message.payload)
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
    } catch (error) {
      const current = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: message.id } })
      const exhausted = current.attempts >= MAX_ATTEMPTS
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: exhausted ? 'DEAD' : 'PENDING',
          lastError: error instanceof Error ? error.message : String(error),
          // Exponential backoff, capped so a recovering endpoint is retried promptly.
          availableAt: new Date(Date.now() + Math.min(2 ** current.attempts, 3600) * 1000),
        },
      })
    }
  }

  return claimed.length
}
