import { dispatchOutboxBatch, workerPrisma } from './outbox-dispatcher'
import { registry } from './handlers'

const IDLE_POLL_MS = 2000

async function main(): Promise<void> {
  let running = true
  const stop = (): void => {
    running = false
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)

  // eslint-disable-next-line no-console
  console.log('  outbox worker started')

  while (running) {
    try {
      const summary = await dispatchOutboxBatch(registry)
      if (summary.claimed === 0) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS))
      } else if (summary.dead > 0) {
        // eslint-disable-next-line no-console
        console.warn(`  ${summary.dead} message(s) parked as DEAD — a human needs to look`)
      }
    } catch (error) {
      // A failure of the loop itself, not of a message. Back off rather than
      // spinning against a database that is down.
      // eslint-disable-next-line no-console
      console.error('  dispatch loop error:', error instanceof Error ? error.message : error)
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS * 5))
    }
  }

  await workerPrisma.$disconnect()
}

void main()
