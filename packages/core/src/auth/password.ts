import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Hand-wrapped rather than promisify()'d: promisify resolves to the three-argument
 * overload and loses the options parameter, which is where the cost parameters
 * live. A cast would silence the error while hiding that.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    )
  })
}

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and listed by OWASP as an acceptable choice. Argon2id
 * is the more modern pick, but every Node binding for it is a native module,
 * and an ERP that must build on a developer laptop, a CI runner and a container
 * image does not need a compiler in that path. This costs one dependency fewer
 * and one supply-chain surface fewer.
 *
 * Parameters follow OWASP's scrypt guidance: N=2^17, r=8, p=1.
 */
const N = 2 ** 17
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Stored as `scrypt$N$r$p$salt$hash`, so parameters can change without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`
}

/**
 * Always compares in constant time, and never throws on a malformed stored
 * hash — a parse error must read as "wrong password", not as a different
 * failure an attacker can distinguish.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  let expected: Buffer
  let salt: Buffer
  try {
    salt = Buffer.from(parts[4] ?? '', 'base64')
    expected = Buffer.from(parts[5] ?? '', 'base64')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    })
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** True when a stored hash was made with weaker parameters and should be re-hashed on next login. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true
  return Number(parts[1]) < N || Number(parts[2]) < R || Number(parts[3]) < P
}
