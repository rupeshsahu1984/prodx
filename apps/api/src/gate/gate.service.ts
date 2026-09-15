import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { runIdempotent, type IdempotencyKey } from '@prodx/core'
import { withScope, type DbScope } from '@prodx/db'
import { PrismaIdempotencyAdapter } from './idempotency.adapter'

export interface DeviceRef {
  /** Which terminal is speaking: GATE_SCANNER_A, WEIGHBRIDGE_01. */
  deviceSource: string
  /** That device's own reference for the event. */
  deviceRef: string
}

export interface GateInRequest extends DeviceRef {
  vehicleNo: string
  driverName?: string
  purchaseOrderId?: string
  plantId: string
  occurredAt?: string
}

export interface WeighbridgeRequest extends DeviceRef {
  gateEventId: string
  grossWeight: number
  tareWeight: number
  weighedAt?: string
}

export interface GateOutRequest extends DeviceRef {
  vehicleNo: string
  plantId: string
  occurredAt?: string
}

@Injectable()
export class GateService {
  private readonly idempotency = new PrismaIdempotencyAdapter()

  /**
   * A vehicle arriving at the gate.
   *
   * Two layers stop a double-tap creating two entries: the idempotency key, and
   * the unique constraint on (tenant, device source, device ref) on the event
   * itself. The second is the real guarantee — if the key table were ever
   * cleaned up, the event table would still refuse.
   */
  async gateIn(scope: DbScope, request: GateInRequest): Promise<unknown> {
    return this.once(scope, request, async () =>
      withScope(scope, async (tx) => {
        if (request.purchaseOrderId !== undefined) {
          // Resolved inside the caller's scope, so a gate terminal cannot admit
          // a vehicle against another factory's order.
          const po = await tx.purchaseOrder.findUnique({ where: { id: request.purchaseOrderId } })
          if (po === null) {
            throw new NotFoundException({
              code: 'PO_NOT_FOUND',
              message: 'That purchase order is not visible from this gate.',
            })
          }
        }
        const event = await tx.gateEvent.create({
          data: {
            tenantId: scope.tenantId,
            plantId: request.plantId,
            direction: 'IN',
            vehicleNo: request.vehicleNo.toUpperCase().replace(/\s+/g, ''),
            driverName: request.driverName ?? null,
            purchaseOrderId: request.purchaseOrderId ?? null,
            occurredAt: request.occurredAt === undefined ? new Date() : new Date(request.occurredAt),
            deviceSource: request.deviceSource,
            deviceRef: request.deviceRef,
          },
        })
        return { gateEventId: event.id, vehicleNo: event.vehicleNo, direction: event.direction }
      }),
    )
  }

  /**
   * A weighment.
   *
   * Net is computed once and stored, never derived on read: the scale is the
   * source of truth and a later correction to gross or tare must not silently
   * restate a historical net (ADR 0004 — the second quantity is measured).
   */
  async weigh(scope: DbScope, request: WeighbridgeRequest): Promise<unknown> {
    if (request.tareWeight > request.grossWeight) {
      throw new BadRequestException({
        code: 'INVALID_WEIGHMENT',
        message: 'Tare weight cannot exceed gross weight. Check which pass this reading is from.',
      })
    }

    return this.once(scope, request, async () =>
      withScope(scope, async (tx) => {
        const gateEvent = await tx.gateEvent.findUnique({ where: { id: request.gateEventId } })
        if (gateEvent === null) {
          throw new NotFoundException({
            code: 'GATE_EVENT_NOT_FOUND',
            message: 'No gate entry for that reference.',
          })
        }
        const net = Math.round((request.grossWeight - request.tareWeight) * 1000) / 1000
        const ticket = await tx.weighbridgeTicket.create({
          data: {
            tenantId: scope.tenantId,
            gateEventId: gateEvent.id,
            grossWeight: String(request.grossWeight),
            tareWeight: String(request.tareWeight),
            netWeight: String(net),
            weighedAt: request.weighedAt === undefined ? new Date() : new Date(request.weighedAt),
            deviceSource: request.deviceSource,
            deviceRef: request.deviceRef,
          },
        })
        return { weighbridgeTicketId: ticket.id, netWeight: net, vehicleNo: gateEvent.vehicleNo }
      }),
    )
  }

  /**
   * Exit clearance.
   *
   * A vehicle that entered against a purchase order may not leave until a goods
   * receipt has been posted for it. Without this the gate is a logbook; with it
   * the truck cannot drive away before the stock exists in the system, which is
   * the entire operational reason the gate is part of the ERP.
   */
  async gateOut(scope: DbScope, request: GateOutRequest): Promise<unknown> {
    return this.once(scope, request, async () =>
      withScope(scope, async (tx) => {
        const vehicleNo = request.vehicleNo.toUpperCase().replace(/\s+/g, '')

        const entry = await tx.gateEvent.findFirst({
          where: { vehicleNo, direction: 'IN', plantId: request.plantId },
          orderBy: { occurredAt: 'desc' },
          include: { goodsReceipts: true },
        })
        if (entry === null) {
          throw new NotFoundException({
            code: 'NO_GATE_ENTRY',
            message: `${vehicleNo} has no recorded entry at this plant.`,
          })
        }
        if (entry.purchaseOrderId !== null) {
          const posted = entry.goodsReceipts.some((grn) => grn.state === 'POSTED')
          if (!posted) {
            throw new ConflictException({
              code: 'RECEIPT_PENDING',
              message:
                `${vehicleNo} entered against a purchase order and no goods receipt has been ` +
                'posted. Post the receipt, or record a security clearance, before gate out.',
            })
          }
        }

        const event = await tx.gateEvent.create({
          data: {
            tenantId: scope.tenantId,
            plantId: request.plantId,
            direction: 'OUT',
            vehicleNo,
            purchaseOrderId: entry.purchaseOrderId,
            occurredAt: request.occurredAt === undefined ? new Date() : new Date(request.occurredAt),
            deviceSource: request.deviceSource,
            deviceRef: request.deviceRef,
          },
        })
        const minutes = Math.round((event.occurredAt.getTime() - entry.occurredAt.getTime()) / 60000)
        return { gateEventId: event.id, vehicleNo, turnaroundMinutes: minutes }
      }),
    )
  }

  /** Vehicles that entered and have not left — what the gate officer actually looks at. */
  async vehiclesInside(scope: DbScope): Promise<unknown> {
    return withScope(scope, async (tx) => {
      const events = await tx.gateEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 200,
        include: {
          weighbridge: { orderBy: { weighedAt: 'asc' } },
          purchaseOrder: { select: { documentNo: true } },
          plant: { select: { code: true } },
        },
      })

      const out = new Set(events.filter((e) => e.direction === 'OUT').map((e) => e.vehicleNo))
      return events
        .filter((e) => e.direction === 'IN' && !out.has(e.vehicleNo))
        .map((e) => ({
          gateEventId: e.id,
          vehicleNo: e.vehicleNo,
          driverName: e.driverName,
          plant: e.plant.code,
          purchaseOrder: e.purchaseOrder?.documentNo ?? null,
          occurredAt: e.occurredAt,
          minutesInside: Math.round((Date.now() - e.occurredAt.getTime()) / 60000),
          weighments: e.weighbridge.map((w) => ({
            gross: Number(w.grossWeight),
            tare: Number(w.tareWeight),
            net: Number(w.netWeight),
          })),
        }))
    })
  }

  /** Wraps a device call so a retry replays instead of repeating. */
  private async once<T>(scope: DbScope, request: DeviceRef, work: () => Promise<T>): Promise<T> {
    const key: IdempotencyKey = {
      tenantId: scope.tenantId,
      source: request.deviceSource,
      externalRef: request.deviceRef,
    }
    const { result } = await runIdempotent(this.idempotency, key, request, work)
    return result
  }
}
