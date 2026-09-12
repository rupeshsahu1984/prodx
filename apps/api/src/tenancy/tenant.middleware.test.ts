import { describe, expect, it } from 'vitest'
import { isHeaderTenancyAllowed } from './tenant.middleware'

describe('isHeaderTenancyAllowed', () => {
  it('is off when nothing is configured', () => {
    // The default must be closed. A header-derived tenant id is a cross-tenant
    // read of every table, so it can never be the fallback.
    expect(isHeaderTenancyAllowed({})).toBe(false)
  })

  it('is off in production even when explicitly enabled', () => {
    expect(
      isHeaderTenancyAllowed({ NODE_ENV: 'production', PRODX_ALLOW_HEADER_TENANT: '1' }),
    ).toBe(false)
  })

  it('is off in development unless explicitly enabled', () => {
    expect(isHeaderTenancyAllowed({ NODE_ENV: 'development' })).toBe(false)
  })

  it('is on only when deliberately enabled outside production', () => {
    expect(
      isHeaderTenancyAllowed({ NODE_ENV: 'development', PRODX_ALLOW_HEADER_TENANT: '1' }),
    ).toBe(true)
  })

  it('does not accept a truthy-looking value other than "1"', () => {
    expect(
      isHeaderTenancyAllowed({ NODE_ENV: 'development', PRODX_ALLOW_HEADER_TENANT: 'true' }),
    ).toBe(false)
  })
})
