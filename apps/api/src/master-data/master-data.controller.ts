import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import {
  approvalRuleInputSchema, departmentInputSchema, itemInputSchema, numberSeriesInputSchema,
  partyInputSchema, plantInputSchema, roleInputSchema, uomInputSchema, userInputSchema,
} from '@prodx/contracts'
import { RequirePermission } from '../auth/permissions.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { currentDbScope } from '../tenancy/tenant-context'
import { MasterDataService } from './master-data.service'

/**
 * Master data.
 *
 * Reads need master_data:read; every write needs master_data:write. Master data
 * is separated from transactional permissions on purpose — a buyer raises
 * orders all day and should not be able to invent a supplier while doing it.
 */
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly master: MasterDataService) {}

  @Get('uoms') @RequirePermission('master_data:read')
  uoms(): Promise<unknown> { return this.master.listUoms(currentDbScope()) }

  @Post('uoms') @RequirePermission('master_data:write') @HttpCode(201)
  createUom(@Body(new ZodValidationPipe(uomInputSchema)) body: never): Promise<unknown> {
    return this.master.createUom(currentDbScope(), body)
  }

  @Get('items') @RequirePermission('master_data:read')
  items(): Promise<unknown> { return this.master.listItems(currentDbScope()) }

  @Post('items') @RequirePermission('master_data:write') @HttpCode(201)
  createItem(@Body(new ZodValidationPipe(itemInputSchema)) body: never): Promise<unknown> {
    return this.master.saveItem(currentDbScope(), body)
  }

  @Put('items/:id') @RequirePermission('master_data:write')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(itemInputSchema)) body: never,
  ): Promise<unknown> {
    return this.master.saveItem(currentDbScope(), body, id)
  }

  @Get('parties') @RequirePermission('master_data:read')
  parties(): Promise<unknown> { return this.master.listParties(currentDbScope()) }

  @Post('parties') @RequirePermission('master_data:write') @HttpCode(201)
  createParty(@Body(new ZodValidationPipe(partyInputSchema)) body: never): Promise<unknown> {
    return this.master.saveParty(currentDbScope(), body)
  }

  @Put('parties/:id') @RequirePermission('master_data:write')
  updateParty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(partyInputSchema)) body: never,
  ): Promise<unknown> {
    return this.master.saveParty(currentDbScope(), body, id)
  }

  @Get('org') @RequirePermission('master_data:read')
  org(): Promise<unknown> { return this.master.listOrg(currentDbScope()) }

  @Post('plants') @RequirePermission('master_data:write') @HttpCode(201)
  createPlant(@Body(new ZodValidationPipe(plantInputSchema)) body: never): Promise<unknown> {
    return this.master.createPlant(currentDbScope(), body)
  }

  @Post('departments') @RequirePermission('master_data:write') @HttpCode(201)
  createDepartment(@Body(new ZodValidationPipe(departmentInputSchema)) body: never): Promise<unknown> {
    return this.master.createDepartment(currentDbScope(), body)
  }

  @Get('roles') @RequirePermission('master_data:read')
  roles(): Promise<unknown> { return this.master.listRoles(currentDbScope()) }

  @Post('roles') @RequirePermission('master_data:write') @HttpCode(201)
  createRole(@Body(new ZodValidationPipe(roleInputSchema)) body: never): Promise<unknown> {
    return this.master.saveRole(currentDbScope(), body)
  }

  @Put('roles/:id') @RequirePermission('master_data:write')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(roleInputSchema)) body: never,
  ): Promise<unknown> {
    return this.master.saveRole(currentDbScope(), body, id)
  }

  @Get('users') @RequirePermission('master_data:read')
  users(): Promise<unknown> { return this.master.listUsers(currentDbScope()) }

  @Post('users') @RequirePermission('master_data:write') @HttpCode(201)
  createUser(@Body(new ZodValidationPipe(userInputSchema)) body: never): Promise<unknown> {
    return this.master.saveUser(currentDbScope(), body)
  }

  @Put('users/:id') @RequirePermission('master_data:write')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userInputSchema)) body: never,
  ): Promise<unknown> {
    return this.master.saveUser(currentDbScope(), body, id)
  }

  @Get('number-series') @RequirePermission('master_data:read')
  numberSeries(): Promise<unknown> { return this.master.listNumberSeries(currentDbScope()) }

  @Post('number-series') @RequirePermission('master_data:write') @HttpCode(201)
  createNumberSeries(@Body(new ZodValidationPipe(numberSeriesInputSchema)) body: never): Promise<unknown> {
    return this.master.createNumberSeries(currentDbScope(), body)
  }

  @Get('approval-rules') @RequirePermission('master_data:read')
  approvalRules(): Promise<unknown> { return this.master.listApprovalRules(currentDbScope()) }

  @Post('approval-rules') @RequirePermission('master_data:write') @HttpCode(201)
  createApprovalRule(@Body(new ZodValidationPipe(approvalRuleInputSchema)) body: never): Promise<unknown> {
    return this.master.createApprovalRule(currentDbScope(), body)
  }
}
