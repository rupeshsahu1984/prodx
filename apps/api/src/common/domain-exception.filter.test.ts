import { ForbiddenException, type ArgumentsHost } from '@nestjs/common'
import { IdempotencyConflictError, SegregationOfDutiesError } from '@prodx/core'
import { describe, expect, it, vi } from 'vitest'
import { DomainExceptionFilter } from './domain-exception.filter'

function capture() {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost
  return { host, status, json }
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter()

  it('maps a reused idempotency key to 409, not 500', () => {
    // The reason this filter exists: a 500 tells a device to retry, and a
    // repeated key with a changed payload is a bug retrying cannot fix.
    const { host, status, json } = capture()
    filter.catch(
      new IdempotencyConflictError({ tenantId: 't', source: 'WB', externalRef: 'x' }),
      host,
    )
    expect(status).toHaveBeenCalledWith(409)
    expect(json.mock.calls[0]?.[0]).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('maps segregation of duties to 403', () => {
    const { host, status } = capture()
    filter.catch(new SegregationOfDutiesError(), host)
    expect(status).toHaveBeenCalledWith(403)
  })

  it('passes a deliberate HttpException through untouched', () => {
    const { host, status, json } = capture()
    filter.catch(new ForbiddenException({ code: 'FORBIDDEN', message: 'nope' }), host)
    expect(status).toHaveBeenCalledWith(403)
    expect(json.mock.calls[0]?.[0]).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('maps a Prisma unique violation to 409 and names the field', () => {
    const { host, status, json } = capture()
    filter.catch(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['document_no'] } }), host)
    expect(status).toHaveBeenCalledWith(409)
    expect(json.mock.calls[0]?.[0]).toMatchObject({ code: 'DUPLICATE_VALUE' })
    expect(String(json.mock.calls[0]?.[0]?.message)).toContain('document_no')
  })

  it('hides the detail of an unmapped error', () => {
    // An internal message can leak schema and business rules.
    const { host, status, json } = capture()
    filter.catch(new Error('relation "secret_table" does not exist'), host)
    expect(status).toHaveBeenCalledWith(500)
    expect(json.mock.calls[0]?.[0]).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    })
  })

  it('does not treat an unknown code as mappable', () => {
    const { host, status } = capture()
    filter.catch(Object.assign(new Error('x'), { code: 'SOMETHING_NEW' }), host)
    expect(status).toHaveBeenCalledWith(500)
  })
})
