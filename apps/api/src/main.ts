import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { isHeaderTenancyAllowed } from './tenancy/tenant.middleware'

async function bootstrap(): Promise<void> {
  // Refuse to start rather than serve requests with no real tenant resolution.
  // Phase 1 removes this check along with the header stub it guards.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'This build has no authentication. Tenant resolution must come from a verified ' +
        'JWT claim before running in production (ADR 0002).',
    )
  }
  if (!isHeaderTenancyAllowed(process.env)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[prodx-api] Tenant-scoped routes will return 503. ' +
        'Set PRODX_ALLOW_HEADER_TENANT=1 to enable the Phase 0 header stub.',
    )
  }

  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()
  await app.listen(process.env['PORT'] ?? 3001)
}

void bootstrap()
