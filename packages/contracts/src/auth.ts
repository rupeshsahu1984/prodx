import { z } from 'zod'

export const loginRequestSchema = z.object({
  tenantCode: z.string().min(1).max(64),
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int(),
})
export type TokenPair = z.infer<typeof tokenPairSchema>

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
})
export type RefreshRequest = z.infer<typeof refreshRequestSchema>

/** Claims carried by the access token. `perms` is embedded to avoid a database read per request. */
export const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  tid: z.string().uuid(),
  perms: z.array(z.string()),
})
export type AccessClaims = z.infer<typeof accessClaimsSchema>

export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  permissions: z.array(z.string()),
})
