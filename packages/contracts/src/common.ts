import { z } from 'zod'

/** Every list endpoint is paginated. ERP tables reach millions of rows. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export type Pagination = z.infer<typeof paginationSchema>

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })

/**
 * Errors carry a stable machine-readable code. Never a raw Prisma error and
 * never a stack trace — both leak schema detail to the client.
 */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>

/**
 * Quantities always travel with their unit. A bare number is never a quantity
 * in this system (ADR 0004), and dual-UoM items carry the second one measured,
 * not derived.
 */
export const quantitySchema = z.object({
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Quantity must be a decimal string'),
  uomCode: z.string().min(1),
  secondaryValue: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
  secondaryUomCode: z.string().min(1).optional(),
})
export type Quantity = z.infer<typeof quantitySchema>

/** Sent by gate, weighbridge and shop-floor clients, which retry (gap 8). */
export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().min(8).max(200),
})
