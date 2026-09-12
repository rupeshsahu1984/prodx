import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  allocateDocumentNumber,
  applyIssue,
  applyReceipt,
  assertPostable,
  emptyValuation,
  goodsReceiptWorkflow,
  type PeriodStatus,
  type ValuationState,
} from '@prodx/core'
import { withTenantTransaction, type Prisma, type PlantScope } from '@prodx/db'
import Decimal from 'decimal.js'
import { PrismaNumberSeriesAdapter } from '../numbering/number-series.adapter'

/** Prisma's Decimal and decimal.js are different classes; go through the string. */
const D = (value: Prisma.Decimal | string | number): Decimal => new Decimal(value.toString())

export interface PostingActor {
  actorId: string
  permissions: readonly string[]
  /** The factories this actor may post into. Enforced by RLS, not by a filter. */
  plantScope: PlantScope
  /** Only an actor with the adjustment permission may post into a soft-closed period. */
  canPostAdjustments: boolean
}

/**
 * The transactional heart of the ERP.
 *
 * Posting a goods receipt moves stock, revalues the item, writes a journal and
 * consumes purchase-order quantity. Those are one fact about the world, so they
 * are one database transaction. Nothing external is called from inside it —
 * intents go to the outbox and a worker delivers them.
 */
@Injectable()
export class PostingService {
  async postGoodsReceipt(
    tenantId: string,
    goodsReceiptId: string,
    actor: PostingActor,
  ): Promise<{ documentNo: string }> {
    return withTenantTransaction(tenantId, actor.plantScope, async (tx) => {
      const grn = await tx.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        include: { lines: { orderBy: { lineNo: 'asc' } }, purchaseOrder: true },
      })
      if (grn === null) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Receipt not found' })
      if (grn.lines.length === 0) {
        throw new BadRequestException({ code: 'NO_LINES', message: 'Receipt has no lines' })
      }

      // Throws on an invalid transition or a missing permission.
      const nextState = goodsReceiptWorkflow.apply('DRAFT' as const, 'post', {
        permissions: actor.permissions,
        actorId: actor.actorId,
      })
      if (grn.state !== 'DRAFT') {
        throw new ConflictException({
          code: 'ALREADY_POSTED',
          message: `Receipt is ${grn.state}. A posted receipt is reversed, never re-posted.`,
        })
      }

      await this.assertPeriodOpen(tx, grn.legalEntityId, grn.postingDate, actor, false)

      let inventoryValue = new Decimal(0)

      for (const line of grn.lines) {
        const quantity = D(line.quantity)
        const amount = D(line.amount)

        await this.guardOverReceipt(tx, line.purchaseOrderLineId, quantity)

        const valuation = await this.applyValuation(
          tx,
          grn.tenantId,
          line.itemId,
          grn.plantId,
          quantity,
          amount,
        )

        await tx.stockLedgerEntry.create({
          data: {
            tenantId: grn.tenantId,
            plantId: grn.plantId,
            itemId: line.itemId,
            stockUnitId: line.stockUnitId,
            storageLocationId: line.storageLocationId,
            direction: 'IN',
            quantity: quantity.toString(),
            secondaryQuantity: line.secondaryQuantity?.toString() ?? null,
            unitCost: valuation.unitCost.toString(),
            totalValue: amount.toString(),
            postingDate: grn.postingDate,
            sourceType: 'GOODS_RECEIPT',
            sourceId: grn.id,
          },
        })

        await this.adjustBalance(
          tx,
          grn.tenantId,
          line.stockUnitId,
          line.storageLocationId,
          quantity,
          line.secondaryQuantity === null ? null : D(line.secondaryQuantity),
        )

        await tx.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: { increment: line.quantity } },
        })

        inventoryValue = inventoryValue.plus(amount)
      }

      const documentNo =
        grn.documentNo !== ''
          ? grn.documentNo
          : await allocateDocumentNumber(new PrismaNumberSeriesAdapter(tx), {
              tenantId: grn.tenantId,
              legalEntityId: grn.legalEntityId,
              seriesCode: 'GOODS_RECEIPT',
              fiscalYear: this.fiscalYearLabel(grn.postingDate),
            })

      // Dr Inventory / Cr GRN accrual. The supplier invoice later clears the
      // accrual against payables, which is why receipt and invoice are separate
      // postings rather than one.
      await this.writeJournal(tx, {
        tenantId: grn.tenantId,
        legalEntityId: grn.legalEntityId,
        documentNo,
        postingDate: grn.postingDate,
        sourceId: grn.id,
        narration: `Goods receipt ${documentNo}`,
        debitAccount: 'INVENTORY',
        creditAccount: 'GRN_ACCRUAL',
        amount: inventoryValue,
      })

      // Optimistic locking: another poster racing this one loses here rather
      // than double-posting the stock.
      const updated = await tx.goodsReceipt.updateMany({
        where: { id: grn.id, version: grn.version },
        data: { state: nextState, documentNo, version: { increment: 1 } },
      })
      if (updated.count === 0) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message: 'The receipt changed while posting. Reload and try again.',
        })
      }

      await tx.outboxMessage.create({
        data: {
          tenantId: grn.tenantId,
          topic: 'goods_receipt.posted',
          payload: { goodsReceiptId: grn.id, documentNo, purchaseOrderId: grn.purchaseOrderId },
        },
      })

      return { documentNo }
    })
  }

  /**
   * Reversal, not deletion. The original entries stay; opposite entries are
   * added and the journal references the one it reverses.
   */
  async reverseGoodsReceipt(
    tenantId: string,
    goodsReceiptId: string,
    actor: PostingActor,
  ): Promise<void> {
    await withTenantTransaction(tenantId, actor.plantScope, async (tx) => {
      const grn = await tx.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      })
      if (grn === null) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Receipt not found' })

      goodsReceiptWorkflow.apply('POSTED' as const, 'reverse', {
        permissions: actor.permissions,
        actorId: actor.actorId,
      })
      if (grn.state !== 'POSTED') {
        throw new ConflictException({
          code: 'NOT_POSTED',
          message: `Only a posted receipt can be reversed; this one is ${grn.state}.`,
        })
      }

      await this.assertPeriodOpen(tx, grn.legalEntityId, grn.postingDate, actor, true)

      let reversedValue = new Decimal(0)

      for (const line of grn.lines) {
        const quantity = D(line.quantity)

        const current = await this.loadValuation(tx, grn.tenantId, line.itemId, grn.plantId)
        const { state, issuedValue } = applyIssue(current, quantity, { allowNegative: true })
        await this.saveValuation(tx, grn.tenantId, line.itemId, grn.plantId, state)

        await tx.stockLedgerEntry.create({
          data: {
            tenantId: grn.tenantId,
            plantId: grn.plantId,
            itemId: line.itemId,
            stockUnitId: line.stockUnitId,
            storageLocationId: line.storageLocationId,
            direction: 'OUT',
            quantity: quantity.toString(),
            secondaryQuantity: line.secondaryQuantity?.toString() ?? null,
            unitCost: current.unitCost.toString(),
            totalValue: issuedValue.toString(),
            postingDate: grn.postingDate,
            sourceType: 'GOODS_RECEIPT_REVERSAL',
            sourceId: grn.id,
          },
        })

        await this.adjustBalance(
          tx,
          grn.tenantId,
          line.stockUnitId,
          line.storageLocationId,
          quantity.negated(),
          line.secondaryQuantity === null ? null : D(line.secondaryQuantity).negated(),
        )

        await tx.purchaseOrderLine.update({
          where: { id: line.purchaseOrderLineId },
          data: { receivedQuantity: { decrement: line.quantity } },
        })

        reversedValue = reversedValue.plus(issuedValue)
      }

      const original = await tx.journalEntry.findFirst({
        where: { tenantId: grn.tenantId, sourceType: 'GOODS_RECEIPT', sourceId: grn.id },
      })

      await this.writeJournal(tx, {
        tenantId: grn.tenantId,
        legalEntityId: grn.legalEntityId,
        documentNo: `${grn.documentNo}-REV`,
        postingDate: grn.postingDate,
        sourceId: grn.id,
        sourceType: 'GOODS_RECEIPT_REVERSAL',
        narration: `Reversal of goods receipt ${grn.documentNo}`,
        debitAccount: 'GRN_ACCRUAL',
        creditAccount: 'INVENTORY',
        amount: reversedValue,
        reversesJournalEntryId: original?.id ?? null,
      })

      const updated = await tx.goodsReceipt.updateMany({
        where: { id: grn.id, version: grn.version },
        data: { state: 'REVERSED', version: { increment: 1 } },
      })
      if (updated.count === 0) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message: 'The receipt changed while reversing. Reload and try again.',
        })
      }
    })
  }

  // ───────────────────────── internals ─────────────────────────

  private fiscalYearLabel(date: Date): string {
    // Indian fiscal year: April to March.
    const year = date.getUTCFullYear()
    const start = date.getUTCMonth() >= 3 ? year : year - 1
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
  }

  private async assertPeriodOpen(
    tx: Prisma.TransactionClient,
    legalEntityId: string,
    postingDate: Date,
    actor: PostingActor,
    isAdjustment: boolean,
  ): Promise<void> {
    const period = await tx.fiscalPeriod.findFirst({
      where: {
        startDate: { lte: postingDate },
        endDate: { gte: postingDate },
        fiscalYear: { legalEntityId },
      },
      select: { id: true, status: true },
    })
    assertPostable(period === null ? null : { id: period.id, status: period.status as PeriodStatus }, postingDate, {
      canPostAdjustments: actor.canPostAdjustments,
      isAdjustment,
    })
  }

  private async guardOverReceipt(
    tx: Prisma.TransactionClient,
    purchaseOrderLineId: string,
    quantity: Decimal,
  ): Promise<void> {
    const poLine = await tx.purchaseOrderLine.findUniqueOrThrow({
      where: { id: purchaseOrderLineId },
      select: { quantity: true, receivedQuantity: true, lineNo: true },
    })
    const remaining = D(poLine.quantity).minus(D(poLine.receivedQuantity))
    if (quantity.greaterThan(remaining)) {
      throw new BadRequestException({
        code: 'OVER_RECEIPT',
        message: `Line ${poLine.lineNo}: receiving ${quantity.toString()} exceeds the ${remaining.toString()} still outstanding.`,
      })
    }
  }

  private async loadValuation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    plantId: string,
  ): Promise<ValuationState> {
    const row = await tx.itemPlantValuation.findUnique({
      where: { tenantId_itemId_plantId: { tenantId, itemId, plantId } },
    })
    return row === null
      ? emptyValuation()
      : {
          quantityOnHand: D(row.quantityOnHand),
          totalValue: D(row.totalValue),
          unitCost: D(row.unitCost),
        }
  }

  private async saveValuation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    plantId: string,
    state: ValuationState,
  ): Promise<void> {
    const data = {
      quantityOnHand: state.quantityOnHand.toString(),
      totalValue: state.totalValue.toString(),
      unitCost: state.unitCost.toString(),
    }
    await tx.itemPlantValuation.upsert({
      where: { tenantId_itemId_plantId: { tenantId, itemId, plantId } },
      create: { tenantId, itemId, plantId, ...data },
      update: { ...data, version: { increment: 1 } },
    })
  }

  private async applyValuation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    plantId: string,
    quantity: Decimal,
    value: Decimal,
  ): Promise<ValuationState> {
    const next = applyReceipt(await this.loadValuation(tx, tenantId, itemId, plantId), quantity, value)
    await this.saveValuation(tx, tenantId, itemId, plantId, next)
    return next
  }

  private async adjustBalance(
    tx: Prisma.TransactionClient,
    tenantId: string,
    stockUnitId: string,
    storageLocationId: string,
    delta: Decimal,
    secondaryDelta: Decimal | null,
  ): Promise<void> {
    await tx.stockBalance.upsert({
      where: { tenantId_stockUnitId_storageLocationId: { tenantId, stockUnitId, storageLocationId } },
      create: {
        tenantId,
        stockUnitId,
        storageLocationId,
        quantity: delta.toString(),
        secondaryQuantity: secondaryDelta?.toString() ?? null,
      },
      update: {
        quantity: { increment: delta.toString() },
        ...(secondaryDelta === null ? {} : { secondaryQuantity: { increment: secondaryDelta.toString() } }),
        version: { increment: 1 },
      },
    })
  }

  private async writeJournal(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string
      legalEntityId: string
      documentNo: string
      postingDate: Date
      sourceId: string
      sourceType?: string
      narration: string
      debitAccount: string
      creditAccount: string
      amount: Decimal
      reversesJournalEntryId?: string | null
    },
  ): Promise<void> {
    const accounts = await tx.glAccount.findMany({
      where: {
        legalEntityId: params.legalEntityId,
        code: { in: [params.debitAccount, params.creditAccount] },
      },
      select: { id: true, code: true },
    })
    const byCode = new Map(accounts.map((a) => [a.code, a.id]))
    const debitId = byCode.get(params.debitAccount)
    const creditId = byCode.get(params.creditAccount)
    if (debitId === undefined || creditId === undefined) {
      throw new BadRequestException({
        code: 'GL_ACCOUNT_MISSING',
        message: `Chart of accounts is missing ${params.debitAccount} or ${params.creditAccount}.`,
      })
    }

    await tx.journalEntry.create({
      data: {
        tenantId: params.tenantId,
        legalEntityId: params.legalEntityId,
        documentNo: params.documentNo,
        postingDate: params.postingDate,
        narration: params.narration,
        sourceType: params.sourceType ?? 'GOODS_RECEIPT',
        sourceId: params.sourceId,
        reversesJournalEntryId: params.reversesJournalEntryId ?? null,
        lines: {
          create: [
            {
              tenantId: params.tenantId,
              lineNo: 1,
              glAccountId: debitId,
              debit: params.amount.toString(),
              credit: '0',
            },
            {
              tenantId: params.tenantId,
              lineNo: 2,
              glAccountId: creditId,
              debit: '0',
              credit: params.amount.toString(),
            },
          ],
        },
      },
    })
  }
}
