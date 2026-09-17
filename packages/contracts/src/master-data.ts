import { z } from 'zod'

/**
 * Master data contracts.
 *
 * Codes are uppercased and trimmed at the edge so that "rm-001", "RM-001 " and
 * "RM-001" cannot become three different items. A duplicate code caught by a
 * unique constraint is a 409 the user can act on; three near-identical items
 * are a data-quality problem nobody notices for a year.
 */
const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, 'Letters, digits and . _ - / only')
  .transform((v) => v.toUpperCase())

const name = z.string().trim().min(2).max(160)

export const itemInputSchema = z.object({
  code,
  name,
  baseUomId: z.string().uuid(),
  /** A second, measured quantity — metres alongside kilograms (ADR 0004). */
  isDualUom: z.boolean().default(false),
  secondaryUomId: z.string().uuid().nullish(),
  granularity: z.enum(['BULK', 'LOT', 'SERIAL']).default('LOT'),
  characteristics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  isActive: z.boolean().default(true),
}).refine((v) => !v.isDualUom || (v.secondaryUomId !== null && v.secondaryUomId !== undefined), {
  message: 'A dual-UoM item needs a secondary unit',
  path: ['secondaryUomId'],
})
export type ItemInput = z.infer<typeof itemInputSchema>

export const partyInputSchema = z.object({
  code,
  name,
  type: z.enum(['SUPPLIER', 'CUSTOMER', 'BOTH']),
  taxRegistrationNo: z.string().trim().max(20).nullish(),
  isActive: z.boolean().default(true),
})
export type PartyInput = z.infer<typeof partyInputSchema>

export const uomInputSchema = z.object({
  code,
  name,
  dimension: z.enum(['LENGTH', 'MASS', 'AREA', 'VOLUME', 'COUNT', 'TIME']),
})
export type UomInput = z.infer<typeof uomInputSchema>

export const plantInputSchema = z.object({
  code,
  name,
  legalEntityId: z.string().uuid(),
  /** Rejecting negative stock keeps weighted-average valuation meaningful. */
  allowNegativeStock: z.boolean().default(false),
})
export type PlantInput = z.infer<typeof plantInputSchema>

export const departmentInputSchema = z.object({ code, name, plantId: z.string().uuid() })
export type DepartmentInput = z.infer<typeof departmentInputSchema>

export const roleInputSchema = z.object({
  code,
  name,
  permissions: z.array(z.string().trim().min(1)).min(1),
  /** Roles that may not be held together — segregation of duties. */
  conflictsWith: z.array(z.string()).default([]),
})
export type RoleInput = z.infer<typeof roleInputSchema>

export const userInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: name,
  /** Only on create. Omit to leave an existing password alone. */
  password: z.string().min(12).max(1024).optional(),
  isSuperAdmin: z.boolean().default(false),
  roleIds: z.array(z.string().uuid()).default([]),
  plantIds: z.array(z.string().uuid()).default([]),
  departmentIds: z.array(z.string().uuid()).default([]),
  isActive: z.boolean().default(true),
})
export type UserInput = z.infer<typeof userInputSchema>

export const numberSeriesInputSchema = z.object({
  legalEntityId: z.string().uuid(),
  seriesCode: code,
  fiscalYear: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Use the form 2026-27'),
  /** Placeholders: {FY} and a run of # giving the zero-padded width. */
  format: z.string().trim().min(3).max(60),
  nextValue: z.number().int().min(1).default(1),
})
export type NumberSeriesInput = z.infer<typeof numberSeriesInputSchema>

export const approvalRuleInputSchema = z.object({
  documentType: code,
  minAmount: z.number().min(0),
  /** Exclusive upper bound; null is unbounded. Bands must not overlap. */
  maxAmount: z.number().min(0).nullish(),
  plantId: z.string().uuid().nullish(),
  permission: z.string().trim().min(3),
  sequence: z.number().int().min(1).default(1),
}).refine((v) => v.maxAmount === null || v.maxAmount === undefined || v.maxAmount > v.minAmount, {
  message: 'The upper bound must be above the lower bound',
  path: ['maxAmount'],
})
export type ApprovalRuleInput = z.infer<typeof approvalRuleInputSchema>
