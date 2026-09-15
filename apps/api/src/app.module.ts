import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthMiddleware } from './auth/auth.middleware'
import { AuthModule } from './auth/auth.module'
import { PermissionsGuard } from './auth/permissions.guard'
import { GateModule } from './gate/gate.module'
import { HealthController } from './health/health.controller'
import { OperationsModule } from './operations/operations.module'
import { PackEndpointsModule } from './packs/pack-endpoints.module'
import { PacksModule } from './packs/packs.module'
import { PrismaService } from './prisma/prisma.service'
import { PurchasingModule } from './purchasing/purchasing.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, OperationsModule, PacksModule, PackEndpointsModule, GateModule, PurchasingModule],
  controllers: [HealthController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: PermissionsGuard }],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Everything except health and the auth endpoints themselves, which cannot
    // require a token to obtain one.
    consumer
      .apply(AuthMiddleware)
      .exclude('health', 'auth/login', 'auth/refresh', 'auth/logout')
      .forRoutes('*')
  }
}
