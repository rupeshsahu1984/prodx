import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, OWNER_URL } from './helpers'

/**
 * Immutability of posted records is enforced by a trigger, not by convention.
 * Application code can be forgotten; a trigger cannot.
 *
 * These run as the OWNER deliberately: if even the owner cannot mutate these
 * tables, nobody can.
 */
describe('append-only tables', () => {
  let owner: Client

  beforeAll(async () => {
    owner = await connect(OWNER_URL)
  })

  afterAll(async () => {
    await owner.end()
  })

  const appendOnly = [
    'stock_ledger_entry',
    'stock_unit_link',
    'journal_entry',
    'journal_line',
    'audit_event',
  ]

  for (const table of appendOnly) {
    it(`rejects UPDATE on ${table}`, async () => {
      await expect(
        owner.query(`UPDATE ${table} SET tenant_id = tenant_id WHERE false`),
      ).rejects.toThrow(/append-only/i)
    })

    it(`rejects DELETE on ${table}`, async () => {
      await expect(owner.query(`DELETE FROM ${table} WHERE false`)).rejects.toThrow(/append-only/i)
    })
  }
})
