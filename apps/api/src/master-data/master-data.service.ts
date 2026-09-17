import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  ApprovalRuleInput, DepartmentInput, ItemInput, NumberSeriesInput,
  PartyInput, PlantInput, RoleInput, UomInput, UserInput,
} from '@prodx/contracts'
import { hashPassword } from '@prodx/core'
import { withScope, type DbScope, type Prisma } from '@prodx/db'

/**
 * Master data.
 *
 * Every write runs through withScope, so RLS decides what this caller may touch
 * — a plant head creating a department cannot attach it to another factory, and
 * the refusal comes from the database rather than from a check here that could
 * be forgotten.
 */
@Injectable()
export class MasterDataService {
  // ── reference ─────────────────────────────────────────────────────────────

  listUoms(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) => tx.uom.findMany({ orderBy: { code: 'asc' } }))
  }

  createUom(scope: DbScope, input: UomInput): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.uom.create({ data: { tenantId: scope.tenantId, ...input } }),
    )
  }

  // ── items ─────────────────────────────────────────────────────────────────

  listItems(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.item.findMany({
        orderBy: { code: 'asc' },
        take: 200,
        include: {
          baseUom: { select: { code: true } },
          secondaryUom: { select: { code: true } },
        },
      }),
    )
  }

  async saveItem(scope: DbScope, input: ItemInput, id?: string): Promise<unknown> {
    const data = {
      code: input.code,
      name: input.name,
      baseUomId: input.baseUomId,
      isDualUom: input.isDualUom,
      secondaryUomId: input.isDualUom ? (input.secondaryUomId ?? null) : null,
      granularity: input.granularity,
      characteristics: input.characteristics as Prisma.InputJsonValue,
      isActive: input.isActive,
    }
    return withScope(scope, async (tx) => {
      if (id === undefined) {
        const item = await tx.item.create({ data: { tenantId: scope.tenantId, ...data } })
        // Bulk items still get a stock unit so the ledger has one uniform shape
        // (ADR 0006); without it the first receipt has nothing to post against.
        await tx.stockUnit.create({
          data: {
            tenantId: scope.tenantId,
            itemId: item.id,
            reference: `LOT-${item.code}-001`,
            granularity: input.granularity,
          },
        })
        return item
      }
      const updated = await tx.item.updateMany({ where: { id }, data })
      if (updated.count === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Item not found' })
      return tx.item.findUniqueOrThrow({ where: { id } })
    })
  }

  // ── parties ───────────────────────────────────────────────────────────────

  listParties(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) => tx.party.findMany({ orderBy: { code: 'asc' }, take: 200 }))
  }

  async saveParty(scope: DbScope, input: PartyInput, id?: string): Promise<unknown> {
    const data = {
      code: input.code,
      name: input.name,
      type: input.type,
      taxRegistrationNo: input.taxRegistrationNo ?? null,
      isActive: input.isActive,
    }
    return withScope(scope, async (tx) => {
      if (id === undefined) return tx.party.create({ data: { tenantId: scope.tenantId, ...data } })
      const updated = await tx.party.updateMany({ where: { id }, data })
      if (updated.count === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Party not found' })
      return tx.party.findUniqueOrThrow({ where: { id } })
    })
  }

  // ── organisation ──────────────────────────────────────────────────────────

  listOrg(scope: DbScope): Promise<unknown> {
    return withScope(scope, async (tx) => ({
      legalEntities: await tx.legalEntity.findMany({ orderBy: { code: 'asc' } }),
      plants: await tx.plant.findMany({
        orderBy: { code: 'asc' },
        include: {
          legalEntity: { select: { code: true } },
          departments: { orderBy: { code: 'asc' } },
          warehouses: { orderBy: { code: 'asc' }, include: { locations: true } },
        },
      }),
    }))
  }

  createPlant(scope: DbScope, input: PlantInput): Promise<unknown> {
    return withScope(scope, async (tx) => {
      const plant = await tx.plant.create({ data: { tenantId: scope.tenantId, ...input } })
      // A plant with no warehouse cannot receive anything, so the obvious one is
      // created with it rather than left as a step people forget.
      const warehouse = await tx.warehouse.create({
        data: { tenantId: scope.tenantId, plantId: plant.id, code: `${input.code}-WH`, name: 'Main Store' },
      })
      await tx.storageLocation.create({
        data: { tenantId: scope.tenantId, warehouseId: warehouse.id, code: 'BAY-01', name: 'Bay 01' },
      })
      return plant
    })
  }

  createDepartment(scope: DbScope, input: DepartmentInput): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.department.create({ data: { tenantId: scope.tenantId, ...input } }),
    )
  }

  // ── users, roles and scope ────────────────────────────────────────────────

  listRoles(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.role.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { users: true } } } }),
    )
  }

  async saveRole(scope: DbScope, input: RoleInput, id?: string): Promise<unknown> {
    return withScope(scope, async (tx) => {
      if (id === undefined) return tx.role.create({ data: { tenantId: scope.tenantId, ...input } })
      const updated = await tx.role.updateMany({ where: { id }, data: input })
      if (updated.count === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' })
      return tx.role.findUniqueOrThrow({ where: { id } })
    })
  }

  listUsers(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.appUser.findMany({
        orderBy: { email: 'asc' },
        // Never the password hash. Returning the whole row "because the frontend
        // filters it" is how credentials leak into logs and analytics.
        select: {
          id: true, email: true, displayName: true, isSuperAdmin: true, isActive: true,
          lockedUntil: true, failedLoginAttempts: true,
          roles: { select: { role: { select: { id: true, code: true, name: true } } } },
          plantAccess: { select: { plant: { select: { id: true, code: true } } } },
          deptAccess: { select: { department: { select: { id: true, code: true } } } },
        },
      }),
    )
  }

  /**
   * Creating or updating a user, including the two scope dimensions.
   *
   * Role and scope rows are replaced wholesale inside one transaction: a partial
   * update that left a stale plant assignment behind would silently widen
   * someone's access, which is the worst way for this to go wrong.
   */
  async saveUser(scope: DbScope, input: UserInput, id?: string): Promise<unknown> {
    if (id === undefined && (input.password === undefined || input.password === '')) {
      throw new BadRequestException({
        code: 'PASSWORD_REQUIRED',
        message: 'A new user needs a password of at least 12 characters.',
      })
    }
    const passwordHash = input.password === undefined || input.password === ''
      ? undefined
      : await hashPassword(input.password)

    return withScope(scope, async (tx) => {
      const userId = id ?? (await tx.appUser.create({
        data: {
          tenantId: scope.tenantId,
          email: input.email,
          displayName: input.displayName,
          passwordHash: passwordHash ?? '',
          isSuperAdmin: input.isSuperAdmin,
          isActive: input.isActive,
        },
      })).id

      if (id !== undefined) {
        await tx.appUser.updateMany({
          where: { id },
          data: {
            email: input.email,
            displayName: input.displayName,
            isSuperAdmin: input.isSuperAdmin,
            isActive: input.isActive,
            ...(passwordHash === undefined ? {} : { passwordHash, failedLoginAttempts: 0, lockedUntil: null }),
          },
        })
        await tx.userRole.deleteMany({ where: { userId } })
        await tx.userPlantAccess.deleteMany({ where: { userId } })
        await tx.userDepartmentAccess.deleteMany({ where: { userId } })
      }

      for (const roleId of input.roleIds) {
        await tx.userRole.create({ data: { tenantId: scope.tenantId, userId, roleId } })
      }
      for (const plantId of input.plantIds) {
        await tx.userPlantAccess.create({ data: { tenantId: scope.tenantId, userId, plantId } })
      }
      for (const departmentId of input.departmentIds) {
        await tx.userDepartmentAccess.create({ data: { tenantId: scope.tenantId, userId, departmentId } })
      }
      return { id: userId }
    })
  }

  // ── numbering and approvals ───────────────────────────────────────────────

  listNumberSeries(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.numberSeries.findMany({
        orderBy: [{ seriesCode: 'asc' }, { fiscalYear: 'asc' }],
        include: { legalEntity: { select: { code: true } } },
      }),
    )
  }

  createNumberSeries(scope: DbScope, input: NumberSeriesInput): Promise<unknown> {
    if (!/\{#+\}/.test(input.format)) {
      throw new BadRequestException({
        code: 'INVALID_FORMAT',
        message: 'The format needs a run of # for the number, such as INV/{FY}/{####}.',
      })
    }
    return withScope(scope, (tx) =>
      tx.numberSeries.create({ data: { tenantId: scope.tenantId, ...input } }),
    )
  }

  listApprovalRules(scope: DbScope): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.approvalRule.findMany({
        orderBy: [{ documentType: 'asc' }, { minAmount: 'asc' }, { sequence: 'asc' }],
        include: { plant: { select: { code: true } } },
      }),
    )
  }

  createApprovalRule(scope: DbScope, input: ApprovalRuleInput): Promise<unknown> {
    return withScope(scope, (tx) =>
      tx.approvalRule.create({
        data: {
          tenantId: scope.tenantId,
          documentType: input.documentType,
          minAmount: String(input.minAmount),
          maxAmount: input.maxAmount === null || input.maxAmount === undefined ? null : String(input.maxAmount),
          plantId: input.plantId ?? null,
          permission: input.permission,
          sequence: input.sequence,
        },
      }),
    )
  }
}
