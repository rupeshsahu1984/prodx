import { describe, expect, it, vi } from 'vitest'
import {
  allocateDocumentNumber,
  formatDocumentNumber,
  NumberSeriesNotConfiguredError,
  type NumberSeriesKey,
  type NumberSeriesPort,
} from './number-series'

const key: NumberSeriesKey = {
  tenantId: 't1',
  legalEntityId: 'le1',
  seriesCode: 'SALES_INVOICE',
  fiscalYear: '2026-27',
}

describe('formatDocumentNumber', () => {
  it('pads to the width of the hash run', () => {
    expect(formatDocumentNumber('INV/{FY}/{####}', 42, '2026-27')).toBe('INV/2026-27/0042')
  })

  it('does not truncate a value wider than the padding', () => {
    // Rewriting a number silently would break the statutory series far worse
    // than an over-long one.
    expect(formatDocumentNumber('INV/{###}', 12345, '2026-27')).toBe('INV/12345')
  })

  it('supports several placeholders and repeats', () => {
    expect(formatDocumentNumber('{FY}/GRN/{#####}/{FY}', 7, '2026-27'))
      .toBe('2026-27/GRN/00007/2026-27')
  })

  it('leaves a format with no placeholders alone', () => {
    expect(formatDocumentNumber('MANUAL', 9, '2026-27')).toBe('MANUAL')
  })
})

describe('allocateDocumentNumber', () => {
  it('formats the value the port allocated', async () => {
    const port: NumberSeriesPort = {
      allocate: vi.fn().mockResolvedValue({ value: 1, format: 'INV/{FY}/{####}' }),
    }
    await expect(allocateDocumentNumber(port, key)).resolves.toBe('INV/2026-27/0001')
    expect(port.allocate).toHaveBeenCalledWith(key)
  })

  it('fails loudly when the series is not configured', async () => {
    const port: NumberSeriesPort = { allocate: vi.fn().mockResolvedValue(null) }
    // Falling back to a default series would produce numbers in the wrong
    // statutory sequence, which is worse than refusing to create the document.
    await expect(allocateDocumentNumber(port, key)).rejects.toBeInstanceOf(
      NumberSeriesNotConfiguredError,
    )
  })
})
