import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  // The web app is a separate origin in development. Tokens travel in the
  // Authorization header, not cookies, so no credentials flag is needed.
  app.enableCors({ origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3000' })
  app.enableShutdownHooks()
  await app.listen(process.env['PORT'] ?? 3001)
}

void bootstrap()
