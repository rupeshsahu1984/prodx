import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import {
  allocateByShade,
  type ShadeAllocationResult,
  type ShadeCandidate,
  type ShadePolicy,
} from '@prodx/pack-textile'
import { RequirePermission, RequiresPack } from '../../auth/permissions.guard'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('textile')
@RequiresPack('textile')
export class TextileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('yarn')
  @RequirePermission('textile_yarn:read')
  yarn(): Promise<unknown> {
    return this.prisma.db.textileYarnSpec.findMany({
      include: { item: { select: { code: true, name: true } } },
      orderBy: { count: 'asc' },
    })
  }

  @Get('fabric-specs')
  @RequirePermission('textile_fabric_spec:read')
  fabricSpecs(): Promise<unknown> {
    return this.prisma.db.textileFabricSpec.findMany({
      include: { item: { select: { code: true, name: true } } },
      orderBy: { gsm: 'asc' },
    })
  }

  @Get('dye-lots')
  @RequirePermission('textile_dye_lot:read')
  dyeLots(): Promise<unknown> {
    return this.prisma.db.textileDyeLot.findMany({
      include: { plant: { select: { code: true } } },
      orderBy: { lotDate: 'desc' },
      take: 50,
    })
  }

  @Get('grading')
  @RequirePermission('textile_grading:read')
  grading(): Promise<unknown> {
    return this.prisma.db.textileGrading.findMany({
      include: { stockUnit: { select: { reference: true, shadeBand: true, grade: true } } },
      orderBy: { inspectedAt: 'desc' },
      take: 50,
    })
  }

  /**
   * Shows what a cut plan could be allocated, without reserving anything.
   *
   * The interesting answer is the refusal: enough fabric exists but not within
   * one shade band. `blockedByPolicy` separates that from a genuine shortage,
   * because one is a planning decision and the other is a purchase order.
   */
  @Post('allocate/simulate')
  @RequirePermission('textile_dye_lot:read')
  @HttpCode(200)
  async simulateAllocation(
    @Body() body: { itemId: string; requiredMetres: number; policy?: ShadePolicy },
  ): Promise<ShadeAllocationResult & { candidatesConsidered: number }> {
    const balances = await this.prisma.db.stockBalance.findMany({
      where: { stockUnit: { itemId: body.itemId } },
      include: { stockUnit: { select: { id: true, shadeBand: true, grade: true, createdAt: true } } },
    })

    const candidates: ShadeCandidate[] = balances
      // A roll with no shade band cannot participate in a continuity decision;
      // treating it as its own band would quietly allow the mixing this exists
      // to prevent.
      .filter((b) => b.stockUnit.shadeBand !== null)
      .map((b) => ({
        stockUnitId: b.stockUnit.id,
        shadeBand: b.stockUnit.shadeBand ?? '',
        availableMetres: Number(b.quantity),
        ...(b.stockUnit.grade === null ? {} : { grade: b.stockUnit.grade }),
        receivedAt: b.stockUnit.createdAt,
      }))

    return {
      ...allocateByShade(candidates, {
        requiredMetres: body.requiredMetres,
        policy: body.policy ?? 'SINGLE_BAND',
      }),
      candidatesConsidered: candidates.length,
    }
  }
}
