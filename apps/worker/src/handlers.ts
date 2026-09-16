/**
 * What the outbox actually delivers.
 *
 * A topic with no handler can never succeed, so it is parked immediately rather
 * than retried eight times — retrying something that is not wired up wastes the
 * queue and buries the real failures.
 */
export type OutboxHandler = (payload: unknown) => Promise<void>

export class HandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>()

  on(topic: string, handler: OutboxHandler): this {
    this.handlers.set(topic, handler)
    return this
  }

  has(topic: string): boolean {
    return this.handlers.has(topic)
  }

  async deliver(topic: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(topic)
    if (handler === undefined) throw new UnhandledTopicError(topic)
    await handler(payload)
  }
}

export class UnhandledTopicError extends Error {
  readonly code = 'UNHANDLED_TOPIC'
  constructor(topic: string) {
    super(`No handler registered for topic "${topic}".`)
  }
}

export const registry = new HandlerRegistry()
  .on('goods_receipt.posted', async (payload) => {
    // Stands in for the notification service. Deliberately a real handler
    // rather than a stub that throws: an unroutable message should be visible
    // as DEAD, and a message that is merely uninteresting should not be.
    const { documentNo } = (payload ?? {}) as { documentNo?: string }
    // eslint-disable-next-line no-console
    console.log(`  delivered goods_receipt.posted ${documentNo ?? '(no number)'}`)
  })
  .on('purchase_order.released', async (payload) => {
    const { documentNo } = (payload ?? {}) as { documentNo?: string }
    // eslint-disable-next-line no-console
    console.log(`  delivered purchase_order.released ${documentNo ?? '(no number)'}`)
  })
