import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { withScope, type DbScope } from '@prodx/db'

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED'

/**
 * Tenant configuration.
 *
 * The fiscal calendar is here because ADR 0007 made period status the gate on
 * every posting and then left it with no way to change it — the seed was the
 * only thing that ever set it. A control nobody can operate is not a control.
 */
@Injectable()
export class SettingsService {
  overview(scope: DbScope): Promise<unknown> {
    return withScope(scope, async (tx) => ({
      tenant: await tx.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
        select: { code: true, name: true, isActive: true, createdAt: true },
      }),
      legalEntities: await tx.legalEntity.findMany({
        orderBy: { code: 'asc' },
        select: {
          id: true, code: true, name: true, taxRegistrationNo: true,
          baseCurrency: true, isActive: true,
          _count: { select: { plants: true } },
        },
      }),
      fiscalYears: await tx.fiscalYear.findMany({
        orderBy: { code: 'desc' },
        include: {
          legalEntity: { select: { code: true } },
          periods: { orderBy: { sequence: 'asc' } },
        },
      }),
      packs: await tx.packInstallation.findMany({ orderBy: { packId: 'asc' } }),
      counts: {
        users: await tx.appUser.count(),
        items: await tx.item.count(),
        parties: await tx.party.count(),
        plants: await tx.plant.count(),
      },
    }))
  }

  /**
   * Moving a period between OPEN, SOFT_CLOSED and CLOSED.
   *
   * Reopening is deliberately harder than closing. Closing is routine month-end
   * work; reopening changes what a already-published set of figures can become,
   * so it needs a separate permission and is recorded.
   */
  async setPeriodStatus(
    scope: DbScope,
    periodId: string,
    status: PeriodStatus,
    actor: { actorId: string; permissions: readonly string[] },
  ): Promise<{ status: PeriodStatus }> {
    return withScope(scope, async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({ where: { id: periodId } })
      if (period === null) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Fiscal period not found.' })
      }
      if (period.status === status) {
        throw new BadRequestException({
          code: 'NO_CHANGE',
          message: `The period is already ${status.replace('_', ' ').toLowerCase()}.`,
        })
      }

      const reopening =
        (period.status === 'CLOSED' && status !== 'CLOSED') ||
        (period.status === 'SOFT_CLOSED' && status === 'OPEN')
      if (reopening) {
        const allowed = actor.permissions.some((p) => p === '*' || p === 'period:reopen')
        if (!allowed) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message:
              'Reopening a closed period needs the period:reopen permission. ' +
              'Closing is routine; reopening changes figures that have already been reported.',
          })
        }
      }

      await tx.fiscalPeriod.update({ where: { id: periodId }, data: { status } })

      // Audited with the reason it happened, because "who reopened March" is the
      // first question anyone asks when the numbers move after a close.
      await tx.auditEvent.create({
        data: {
          tenantId: scope.tenantId,
          actorId: actor.actorId,
          entityType: 'FISCAL_PERIOD',
          entityId: periodId,
          action: reopening ? 'REOPENED' : 'CLOSED',
          changes: { status: { from: period.status, to: status } },
          source: 'WEB',
        },
      })
      return { status }
    })
  }

  recentAudit(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    )
  }
}
