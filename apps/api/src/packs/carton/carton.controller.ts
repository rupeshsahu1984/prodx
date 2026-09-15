import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { planTrim, type TrimOrder, type TrimPlan } from '@prodx/pack-carton'
import { RequirePermission, RequiresPack } from '../../auth/permissions.guard'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Carton pack endpoints.
 *
 * Every route carries @RequiresPack, so a tenant without the pack gets a clear
 * "not installed" rather than an empty list. RLS would hide the rows anyway —
 * this is the message, not the boundary.
 */
@Controller('carton')
@RequiresPack('carton')
export class CartonController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('board-specs')
  @RequirePermission('carton_board_spec:read')
  boardSpecs(): Promise<unknown> {
    return this.prisma.db.cartonBoardSpec.findMany({
      include: { item: { select: { code: true, name: true } } },
      orderBy: { gsm: 'asc' },
    })
  }

  @Get('box-styles')
  @RequirePermission('carton_box_style:read')
  boxStyles(): Promise<unknown> {
    return this.prisma.db.cartonBoxStyle.findMany({ orderBy: { code: 'asc' } })
  }

  @Get('tooling')
  @RequirePermission('carton_tool:read')
  async tooling(): Promise<unknown> {
    const tools = await this.prisma.db.cartonTool.findMany({
      include: { plant: { select: { code: true } } },
      orderBy: { code: 'asc' },
    })
    return tools.map((tool) => ({
      ...tool,
      // Surfaced because a die that runs past its life starts producing scrap
      // before anyone notices, and the counter is the only warning.
      lifeUsedPct:
        tool.lifeLimit === null || tool.lifeLimit === 0
          ? null
          : Math.round((tool.currentImpressions / tool.lifeLimit) * 1000) / 10,
    }))
  }

  @Get('trim-plans')
  @RequirePermission('carton_trim_plan:read')
  trimPlans(): Promise<unknown> {
    return this.prisma.db.cartonTrimPlan.findMany({
      include: { plant: { select: { code: true } } },
      orderBy: { planDate: 'desc' },
      take: 50,
    })
  }

  /**
   * Runs the optimiser without saving. A supervisor tries combinations before
   * committing one, so the expensive part is deliberately side-effect free.
   */
  @Post('trim-plans/simulate')
  @RequirePermission('carton_trim_plan:run')
  @HttpCode(200)
  simulate(
    @Body() body: { deckleMm: number; orders: TrimOrder[]; maxTrimMm?: number },
  ): TrimPlan {
    return planTrim(body.deckleMm, body.orders ?? [], {
      ...(body.maxTrimMm === undefined ? {} : { maxTrimMm: body.maxTrimMm }),
    })
  }
}
