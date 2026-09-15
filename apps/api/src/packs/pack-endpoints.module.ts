import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CartonController } from './carton/carton.controller'
import { TextileController } from './textile/textile.controller'

/**
 * The composition root for pack endpoints.
 *
 * This is where the application wires packs in — permitted, and the reason the
 * rule is "core must never import a pack" rather than "nothing may". Core is
 * packages/*; this is apps/api, which is allowed to know what is in the build.
 */
@Module({
  controllers: [CartonController, TextileController],
  providers: [PrismaService],
})
export class PackEndpointsModule {}
