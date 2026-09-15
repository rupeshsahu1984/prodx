import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Response } from 'express'

/**
 * Maps typed domain errors from @prodx/core onto HTTP.
 *
 * The engines throw errors carrying a stable `code` and deliberately know
 * nothing about HTTP — that is what makes them unit-testable without a
 * framework. Without this filter every one of them surfaced as a 500, which is
 * actively harmful for device clients: a 500 says "try again", and a repeated
 * idempotency key with a changed payload is a client bug that retrying will
 * never fix.
 *
 * A code absent from this table is a programming error, not a client error, so
 * it stays a 500 and is logged with its stack.
 */
const STATUS_BY_CODE: Record<string, number> = {
  // Idempotency — the caller must change something, not repeat.
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_FLIGHT: 409,

  // Authorisation. Segregation of duties is a 403: the actor is known and
  // permitted in general, just not for this document.
  FORBIDDEN: 403,
  SEGREGATION_OF_DUTIES: 403,

  // Business state.
  INVALID_TRANSITION: 409,
  FISCAL_PERIOD_CLOSED: 409,
  FISCAL_PERIOD_NOT_FOUND: 400,
  INSUFFICIENT_STOCK: 400,

  // Configuration the tenant has to fix before the document can proceed.
  NUMBER_SERIES_NOT_CONFIGURED: 400,
  NO_APPROVAL_RULE: 400,

  // Packs.
  UNKNOWN_PACK: 404,
  DUPLICATE_PACK: 409,
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DomainExceptionFilter')

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    // Anything already an HttpException was raised deliberately; leave it alone.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse())
      return
    }

    const code = (exception as { code?: unknown })?.code

    // Prisma's unique-violation is a business condition, not a crash: two users
    // releasing at once, or a number series configured behind the documents
    // already issued. A 500 here would hide a fixable problem behind "try again".
    if (code === 'P2002') {
      const target = (exception as { meta?: { target?: unknown } })?.meta?.target
      response.status(409).json({
        code: 'DUPLICATE_VALUE',
        message: Array.isArray(target)
          ? `A record with this ${target.join(', ')} already exists.`
          : 'A record with these values already exists.',
      })
      return
    }

    const status = typeof code === 'string' ? STATUS_BY_CODE[code] : undefined

    if (status === undefined) {
      // Unmapped: log the detail, tell the client nothing. An internal message
      // can leak schema and business rules.
      this.logger.error(
        exception instanceof Error ? exception.stack ?? exception.message : String(exception),
      )
      response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong.' })
      return
    }

    response.status(status).json({
      code,
      message: exception instanceof Error ? exception.message : 'Request could not be completed.',
    })
  }
}
