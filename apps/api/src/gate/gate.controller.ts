import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { RequirePermission } from '../auth/permissions.guard'
import { currentDbScope } from '../tenancy/tenant-context'
import {
  GateService,
  type GateInRequest,
  type GateOutRequest,
  type WeighbridgeRequest,
} from './gate.service'

/**
 * Gate, security and weighbridge.
 *
 * Core, not a pack: every manufacturer has a gate, whatever they make.
 *
 * Every write takes the device's own reference and is idempotent on it. These
 * endpoints are called by terminals on the worst network in the plant — a gate
 * at the boundary, a weighbridge on a serial link — and a retry must never
 * produce a second entry or a second weighment.
 */
@Controller('gate')
export class GateController {
  constructor(private readonly gate: GateService) {}

  @Get('inside')
  @RequirePermission('gate:read')
  inside(): Promise<unknown> {
    return this.gate.vehiclesInside(currentDbScope())
  }

  @Post('in')
  @RequirePermission('gate:in')
  @HttpCode(201)
  gateIn(@Body() body: GateInRequest): Promise<unknown> {
    return this.gate.gateIn(currentDbScope(), body)
  }

  @Post('weigh')
  @RequirePermission('gate:weigh')
  @HttpCode(201)
  weigh(@Body() body: WeighbridgeRequest): Promise<unknown> {
    return this.gate.weigh(currentDbScope(), body)
  }

  @Post('out')
  @RequirePermission('gate:out')
  @HttpCode(201)
  gateOut(@Body() body: GateOutRequest): Promise<unknown> {
    return this.gate.gateOut(currentDbScope(), body)
  }
}
