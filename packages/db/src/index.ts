export {
  prisma,
  forScope,
  withScope,
  platformScope,
  ALL_PLANTS,
  ALL_PACKS,
  ALL_DEPARTMENTS,
} from './tenant-client'
export type {
  TenantClient,
  PlantScope,
  PackScope,
  DepartmentScope,
  DbScope,
} from './tenant-client'
export * from '@prisma/client'
