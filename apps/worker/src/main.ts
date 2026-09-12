import { dispatchOutboxBatch } from './outbox-dispatcher'

const POLL_INTERVAL_MS = 2000

async function main(): Promise<void> {
  let running = true
  process.on('SIGTERM', () => { running = false })
  process.on('SIGINT', () => { running = false })

  while (running) {
    const delivered = await dispatchOutboxBatch(async (topic) => {
      // Phase 0: no destinations wired yet. Phase 1 registers e-way bill,
      // notification and webhook handlers here.
      throw new Error(`No handler registered for topic "${topic}"`)
    })
    if (delivered === 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

void main()
