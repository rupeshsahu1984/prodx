import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    await expect(verifyPassword('Correct horse battery staple', stored)).resolves.toBe(false)
  })

  it('produces a different hash every time', async () => {
    // Same password, different salt. Identical hashes would reveal which users
    // share a password.
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    await expect(verifyPassword('same-password', b)).resolves.toBe(true)
  })

  it('treats a malformed stored hash as a wrong password, not an error', async () => {
    // A distinguishable failure mode is an oracle. All of these must simply be false.
    for (const bad of ['', 'garbage', 'scrypt$1$2$3', 'bcrypt$x$y$z$a$b', 'scrypt$a$b$c$d$e']) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false)
    }
  })

  it('normalises unicode so the same typed password verifies', async () => {
    // U+00E9 vs U+0065 U+0301 — identical on screen, different bytes.
    const stored = await hashPassword('café')
    await expect(verifyPassword('café', stored)).resolves.toBe(true)
  })

  it('flags hashes made with weaker parameters', async () => {
    expect(needsRehash('scrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash(await hashPassword('x'))).toBe(false)
    expect(needsRehash('not-a-hash')).toBe(true)
  })
})
