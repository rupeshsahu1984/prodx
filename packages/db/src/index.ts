export {
  prisma,
  forScope,
  withScope,
  platformScope,
  ALL_PLANTS,
  ALL_PACKS,
} from './tenant-client'
export type { TenantClient, PlantScope, PackScope, DbScope } from './tenant-client'
export * from '@prisma/client'
