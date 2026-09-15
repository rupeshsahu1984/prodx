import jwt from 'jsonwebtoken'
import { beforeAll, describe, expect, it } from 'vitest'
import { JwtService } from './jwt.service'

const SECRET = 'a-test-secret-that-is-definitely-long-enough'

describe('JwtService', () => {
  let service: JwtService

  beforeAll(() => {
    process.env['JWT_SECRET'] = SECRET
    service = new JwtService()
  })

  const claims = {
    sub: '01919000-0000-7000-8000-00000000aaaa',
    tid: '01919000-0000-7000-8000-00000000bbbb',
    perms: ['purchase_order:read'],
    sa: false,
    plants: ['01919000-0000-7000-8000-0000000000p1'.replace(/p/g, 'c')],
    depts: [],
    packs: ['carton'],
  }

  it('round-trips valid claims', () => {
    expect(service.verify(service.sign(claims))).toMatchObject(claims)
  })

  it('refuses to construct without a strong secret', () => {
    const original = process.env['JWT_SECRET']
    try {
      delete process.env['JWT_SECRET']
      expect(() => new JwtService()).toThrow(/JWT_SECRET/)
      process.env['JWT_SECRET'] = 'too-short'
      expect(() => new JwtService()).toThrow(/JWT_SECRET/)
    } finally {
      process.env['JWT_SECRET'] = original
    }
  })

  it('rejects a tampered payload', () => {
    const [header, payload, signature] = service.sign(claims).split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...claims, tid: '01919000-0000-7000-8000-00000000cccc' }),
    ).toString('base64url')
    expect(payload).not.toBe(forged)
    expect(service.verify(`${header}.${forged}.${signature}`)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    expect(service.verify(jwt.sign(claims, 'some-other-secret-of-sufficient-length'))).toBeNull()
  })

  it('rejects an unsigned "alg: none" token', () => {
    // The classic JWT attack. Pinning algorithms on verify is what stops it.
    const unsigned = jwt.sign(claims, '', { algorithm: 'none' })
    expect(service.verify(unsigned)).toBeNull()
  })

  it('rejects an expired token', () => {
    const expired = jwt.sign(claims, SECRET, { algorithm: 'HS256', expiresIn: -60 })
    expect(service.verify(expired)).toBeNull()
  })

  it('rejects a token whose claims are the wrong shape', () => {
    const wrong = jwt.sign({ sub: 'not-a-uuid', tid: 'nope' }, SECRET, { algorithm: 'HS256' })
    expect(service.verify(wrong)).toBeNull()
  })

  it('rejects garbage', () => {
    for (const bad of ['', 'a.b.c', 'not-a-token']) expect(service.verify(bad)).toBeNull()
  })
})
