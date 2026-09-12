import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { PrismaService } from './prisma/prisma.service'
import { TenantMiddleware } from './tenancy/tenant.middleware'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route except health. A route that skips this has no tenant context
    // and will throw rather than read unscoped data.
    consumer.apply(TenantMiddleware).exclude('health').forRoutes('*')
  }
}
