import {
  ALL_DEPARTMENTS,
  ALL_PACKS,
  ALL_PLANTS,
  platformScope,
  prisma,
  withScope,
  type DbScope,
} from '@prodx/db'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { GateService } from '../src/gate/gate.service'
import { PostingService } from '../src/posting/posting.service'
import { seedScenario } from './seed'

const gate = new GateService()
const posting = new PostingService()

const scopeFor = (tenantId: string): DbScope => ({ tenantId, plants: ALL_PLANTS, packs: ALL_PACKS, departments: ALL_DEPARTMENTS })
const device = (source = 'GATE_SCANNER_A') => ({ deviceSource: source, deviceRef: randomUUID() })

afterAll(async () => {
  await prisma.$disconnect()
})

describe('gate and weighbridge', () => {
  it('records an entry and lists the vehicle as inside', async () => {
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)

    const result = (await gate.gateIn(scope, {
      ...device(),
      vehicleNo: ' mh 12 ab 1234 ',
      driverName: 'R. Kumar',
      plantId: s.plantId,
      purchaseOrderId: s.purchaseOrderId,
    })) as { vehicleNo: string }

    // Normalised on the way in: a gate officer types it differently every time,
    // and gate-out has to match what gate-in recorded.
    expect(result.vehicleNo).toBe('MH12AB1234')

    const inside = (await gate.vehiclesInside(scope)) as Array<{ vehicleNo: string }>
    expect(inside.map((v) => v.vehicleNo)).toContain('MH12AB1234')
  })

  it('treats a double-tap as one entry', async () => {
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const ref = device()
    const request = { ...ref, vehicleNo: 'MH12AB0001', plantId: s.plantId }

    const first = (await gate.gateIn(scope, request)) as { gateEventId: string }
    const second = (await gate.gateIn(scope, request)) as { gateEventId: string }

    expect(second.gateEventId).toBe(first.gateEventId)
    const count = await withScope(platformScope(s.tenantId), (tx) =>
      tx.gateEvent.count({ where: { deviceRef: ref.deviceRef } }),
    )
    expect(count).toBe(1)
  })

  it('survives two simultaneous retries', async () => {
    // The real failure mode: a scanner retries before the first call returns.
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const request = { ...device(), vehicleNo: 'MH12AB0002', plantId: s.plantId }

    const results = await Promise.allSettled([
      gate.gateIn(scope, request),
      gate.gateIn(scope, request),
    ])
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)

    const count = await withScope(platformScope(s.tenantId), (tx) =>
      tx.gateEvent.count({ where: { deviceRef: request.deviceRef } }),
    )
    expect(count).toBe(1)
  })

  it('refuses the same device reference with a different payload', async () => {
    // Silently replaying here would discard a genuinely different event.
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const ref = device()

    await gate.gateIn(scope, { ...ref, vehicleNo: 'MH12AB0003', plantId: s.plantId })
    await expect(
      gate.gateIn(scope, { ...ref, vehicleNo: 'MH12AB9999', plantId: s.plantId }),
    ).rejects.toThrow(/different payload/i)
  })

  it('stores the weighment and computes net once', async () => {
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const entry = (await gate.gateIn(scope, {
      ...device(),
      vehicleNo: 'MH12AB0004',
      plantId: s.plantId,
    })) as { gateEventId: string }

    const ticket = (await gate.weigh(scope, {
      ...device('WEIGHBRIDGE_01'),
      gateEventId: entry.gateEventId,
      grossWeight: 18500.5,
      tareWeight: 7200.25,
    })) as { netWeight: number }

    expect(ticket.netWeight).toBe(11300.25)
  })

  it('treats a weighbridge resend as one ticket', async () => {
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const entry = (await gate.gateIn(scope, {
      ...device(),
      vehicleNo: 'MH12AB0005',
      plantId: s.plantId,
    })) as { gateEventId: string }

    const ref = device('WEIGHBRIDGE_01')
    const request = { ...ref, gateEventId: entry.gateEventId, grossWeight: 18500, tareWeight: 7200 }
    await gate.weigh(scope, request)
    await gate.weigh(scope, request)

    const count = await withScope(platformScope(s.tenantId), (tx) =>
      tx.weighbridgeTicket.count({ where: { deviceRef: ref.deviceRef } }),
    )
    expect(count).toBe(1)
  })

  it('rejects a tare heavier than the gross', async () => {
    const s = await seedScenario()
    const scope = scopeFor(s.tenantId)
    const entry = (await gate.gateIn(scope, {
      ...device(),
      vehicleNo: 'MH12AB0006',
      plantId: s.plantId,
    })) as { gateEventId: string }

    await expect(
      gate.weigh(scope, {
        ...device('WEIGHBRIDGE_01'),
        gateEventId: entry.gateEventId,
        grossWeight: 7200,
        tareWeight: 18500,
      }),
    ).rejects.toThrow(/cannot exceed gross/i)
  })

  describe('exit clearance', () => {
    it('refuses gate out while the receipt is unposted', async () => {
      // The control that makes the gate part of the ERP rather than a logbook:
      // the truck cannot leave before the stock exists in the system.
      const s = await seedScenario()
      const scope = scopeFor(s.tenantId)
      await gate.gateIn(scope, {
        ...device(),
        vehicleNo: 'MH12AB0007',
        plantId: s.plantId,
        purchaseOrderId: s.purchaseOrderId,
      })

      await expect(
        gate.gateOut(scope, { ...device(), vehicleNo: 'MH12AB0007', plantId: s.plantId }),
      ).rejects.toThrow(/no goods receipt has been posted/i)
    })

    it('allows gate out once the receipt is posted', async () => {
      const s = await seedScenario()
      const scope = scopeFor(s.tenantId)
      const entry = (await gate.gateIn(scope, {
        ...device(),
        vehicleNo: 'MH12AB0008',
        plantId: s.plantId,
        purchaseOrderId: s.purchaseOrderId,
      })) as { gateEventId: string }

      await withScope(platformScope(s.tenantId), (tx) =>
        tx.goodsReceipt.update({
          where: { id: s.goodsReceiptId },
          data: { gateEventId: entry.gateEventId },
        }),
      )
      await posting.postGoodsReceipt(s.goodsReceiptId, {
        actorId: randomUUID(),
        permissions: ['goods_receipt:post'],
        scope,
        canPostAdjustments: false,
      })

      const out = (await gate.gateOut(scope, {
        ...device(),
        vehicleNo: 'MH12AB0008',
        plantId: s.plantId,
      })) as { turnaroundMinutes: number }

      expect(out.turnaroundMinutes).toBeGreaterThanOrEqual(0)
      const inside = (await gate.vehiclesInside(scope)) as Array<{ vehicleNo: string }>
      expect(inside.map((v) => v.vehicleNo)).not.toContain('MH12AB0008')
    })

    it('lets a vehicle with no purchase order leave freely', async () => {
      // A visitor or an empty return has nothing to clear.
      const s = await seedScenario()
      const scope = scopeFor(s.tenantId)
      await gate.gateIn(scope, { ...device(), vehicleNo: 'MH12AB0009', plantId: s.plantId })
      await expect(
        gate.gateOut(scope, { ...device(), vehicleNo: 'MH12AB0009', plantId: s.plantId }),
      ).resolves.toMatchObject({ vehicleNo: 'MH12AB0009' })
    })

    it('refuses gate out for a vehicle that never entered', async () => {
      const s = await seedScenario()
      await expect(
        gate.gateOut(scopeFor(s.tenantId), {
          ...device(),
          vehicleNo: 'MH99XX0000',
          plantId: s.plantId,
        }),
      ).rejects.toThrow(/no recorded entry/i)
    })
  })

  it('keeps one tenant out of another tenant gate', async () => {
    const a = await seedScenario()
    const b = await seedScenario()
    await gate.gateIn(scopeFor(a.tenantId), {
      ...device(),
      vehicleNo: 'MH12AB0010',
      plantId: a.plantId,
    })

    const inside = (await gate.vehiclesInside(scopeFor(b.tenantId))) as Array<{ vehicleNo: string }>
    expect(inside.map((v) => v.vehicleNo)).not.toContain('MH12AB0010')
  })
})
