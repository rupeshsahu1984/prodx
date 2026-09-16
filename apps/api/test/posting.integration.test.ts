import { ConflictException } from '@nestjs/common'
import {
  ALL_DEPARTMENTS,
  ALL_PACKS,
  ALL_PLANTS,
  platformScope,
  prisma,
  withScope,
} from '@prodx/db'
import { afterAll, describe, expect, it } from 'vitest'
import { PostingService, type PostingActor } from '../src/posting/posting.service'
import { seedScenario } from './seed'

const posting = new PostingService()

/** The scope travels with the actor now, so it has to name the tenant. */
const actorFor = (tenantId: string): PostingActor => ({
  actorId: '01919000-0000-7000-8000-00000000aaaa',
  permissions: ['goods_receipt:post', 'goods_receipt:reverse'],
  scope: { tenantId, plants: ALL_PLANTS, packs: ALL_PACKS, departments: ALL_DEPARTMENTS },
  canPostAdjustments: false,
})

afterAll(async () => {
  await prisma.$disconnect()
})

const read = async <T>(tenantId: string, fn: Parameters<typeof withScope<T>>[1]) =>
  withScope(platformScope(tenantId), fn)

describe('posting a goods receipt', () => {
  it('moves stock, values it, writes a balanced journal and consumes the order', async () => {
    const s = await seedScenario()

    const { documentNo } = await posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))
    expect(documentNo).toBe('GRN/2026-27/0001')

    await read(s.tenantId, async (tx) => {
      const ledger = await tx.stockLedgerEntry.findMany({ where: { sourceId: s.goodsReceiptId } })
      expect(ledger).toHaveLength(1)
      expect(ledger[0]?.direction).toBe('IN')
      expect(ledger[0]?.quantity.toString()).toBe('40')
      expect(ledger[0]?.totalValue.toString()).toBe('1000')

      const balance = await tx.stockBalance.findFirstOrThrow({
        where: { stockUnitId: s.stockUnitId },
      })
      expect(balance.quantity.toString()).toBe('40')

      const valuation = await tx.itemPlantValuation.findFirstOrThrow({
        where: { itemId: s.itemId, plantId: s.plantId },
      })
      expect(valuation.quantityOnHand.toString()).toBe('40')
      expect(valuation.unitCost.toString()).toBe('25')

      const journal = await tx.journalEntry.findFirstOrThrow({
        where: { sourceId: s.goodsReceiptId, sourceType: 'GOODS_RECEIPT' },
        include: { lines: true },
      })
      const debits = journal.lines.reduce((sum, l) => sum + Number(l.debit), 0)
      const credits = journal.lines.reduce((sum, l) => sum + Number(l.credit), 0)
      expect(debits).toBe(1000)
      expect(debits).toBe(credits)

      const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
        where: { id: s.purchaseOrderLineId },
      })
      expect(poLine.receivedQuantity.toString()).toBe('40')

      // The external notification is an intent in the outbox, never an HTTP
      // call from inside the transaction.
      const outbox = await tx.outboxMessage.findMany({ where: { topic: 'goods_receipt.posted' } })
      expect(outbox).toHaveLength(1)
      expect(outbox[0]?.status).toBe('PENDING')
    })
  })

  it('reversal restores stock, valuation and the order quantity exactly', async () => {
    const s = await seedScenario()
    await posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))
    await posting.reverseGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))

    await read(s.tenantId, async (tx) => {
      const balance = await tx.stockBalance.findFirstOrThrow({ where: { stockUnitId: s.stockUnitId } })
      expect(balance.quantity.toString()).toBe('0')

      const valuation = await tx.itemPlantValuation.findFirstOrThrow({
        where: { itemId: s.itemId, plantId: s.plantId },
      })
      expect(valuation.quantityOnHand.toString()).toBe('0')
      // No residual value with no quantity — the gap that otherwise shows up
      // months later as stock valuation not matching the GL.
      expect(valuation.totalValue.toString()).toBe('0')

      const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
        where: { id: s.purchaseOrderLineId },
      })
      expect(poLine.receivedQuantity.toString()).toBe('0')

      // The original entries are still there. Reversal adds, never deletes.
      const ledger = await tx.stockLedgerEntry.findMany({ where: { sourceId: s.goodsReceiptId } })
      expect(ledger.map((l) => l.direction).sort()).toEqual(['IN', 'OUT'])

      const reversal = await tx.journalEntry.findFirstOrThrow({
        where: { sourceType: 'GOODS_RECEIPT_REVERSAL', sourceId: s.goodsReceiptId },
      })
      expect(reversal.reversesJournalEntryId).not.toBeNull()

      const grn = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: s.goodsReceiptId } })
      expect(grn.state).toBe('REVERSED')
    })
  })

  it('refuses to post the same receipt twice', async () => {
    const s = await seedScenario()
    await posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))
    await expect(posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))).rejects.toThrow(
      ConflictException,
    )

    await read(s.tenantId, async (tx) => {
      // The decisive assertion: the refusal left no second movement behind.
      const ledger = await tx.stockLedgerEntry.findMany({ where: { sourceId: s.goodsReceiptId } })
      expect(ledger).toHaveLength(1)
    })
  })

  it('refuses to post into a closed period, and posts nothing at all', async () => {
    const s = await seedScenario({ periodStatus: 'CLOSED' })
    await expect(posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))).rejects.toThrow(
      /closed/i,
    )

    await read(s.tenantId, async (tx) => {
      expect(await tx.stockLedgerEntry.count({ where: { sourceId: s.goodsReceiptId } })).toBe(0)
      expect(await tx.journalEntry.count({ where: { sourceId: s.goodsReceiptId } })).toBe(0)
      const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
        where: { id: s.purchaseOrderLineId },
      })
      expect(poLine.receivedQuantity.toString()).toBe('0')
    })
  })

  it('refuses to receive more than the order still has outstanding', async () => {
    const s = await seedScenario({ receiptQuantity: '140' })
    await expect(posting.postGoodsReceipt(s.goodsReceiptId, actorFor(s.tenantId))).rejects.toThrow(
      /exceeds/i,
    )
  })

  it('refuses to post without the permission, and rolls back cleanly', async () => {
    const s = await seedScenario()
    await expect(
      posting.postGoodsReceipt(s.goodsReceiptId, {
        ...actorFor(s.tenantId),
        permissions: ['goods_receipt:read'],
      }),
    ).rejects.toThrow(/goods_receipt:post/)

    await read(s.tenantId, async (tx) => {
      expect(await tx.stockLedgerEntry.count({ where: { sourceId: s.goodsReceiptId } })).toBe(0)
    })
  })

  it('keeps two tenants entirely separate', async () => {
    const a = await seedScenario()
    const b = await seedScenario()
    await posting.postGoodsReceipt(a.goodsReceiptId, actorFor(a.tenantId))

    // Tenant B's context must not see tenant A's movement, and must not be able
    // to post A's receipt by id.
    await read(b.tenantId, async (tx) => {
      expect(await tx.stockLedgerEntry.count({ where: { sourceId: a.goodsReceiptId } })).toBe(0)
    })
    await expect(posting.postGoodsReceipt(a.goodsReceiptId, actorFor(b.tenantId))).rejects.toThrow(
      /not found/i,
    )
  })
})
