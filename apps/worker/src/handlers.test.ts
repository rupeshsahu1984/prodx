import { describe, expect, it, vi } from 'vitest'
import { HandlerRegistry, UnhandledTopicError } from './handlers'

describe('HandlerRegistry', () => {
  it('delivers to the registered handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const registry = new HandlerRegistry().on('a.b', handler)
    await registry.deliver('a.b', { x: 1 })
    expect(handler).toHaveBeenCalledWith({ x: 1 })
  })

  it('throws a distinguishable error for an unregistered topic', async () => {
    // The dispatcher parks these immediately: retrying a topic nothing listens
    // to cannot ever succeed, and it buries the real failures.
    await expect(new HandlerRegistry().deliver('nope', {})).rejects.toBeInstanceOf(
      UnhandledTopicError,
    )
  })

  it('propagates a handler failure so the message is retried', async () => {
    const registry = new HandlerRegistry().on('a.b', async () => {
      throw new Error('endpoint down')
    })
    await expect(registry.deliver('a.b', {})).rejects.toThrow('endpoint down')
  })

  it('lets a topic be re-registered', () => {
    const registry = new HandlerRegistry().on('a.b', async () => undefined)
    expect(registry.has('a.b')).toBe(true)
    expect(registry.has('c.d')).toBe(false)
  })
})
