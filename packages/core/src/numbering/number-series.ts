/**
 * Gapless document numbering (ADR 0008).
 *
 * The allocation itself is a single locking UPDATE that must run inside the
 * caller's transaction — that is what makes a rolled-back document return its
 * number. This module owns the format resolution and the port; the SQL lives in
 * the adapter so this stays testable without a database.
 */

export interface NumberSeriesKey {
  tenantId: string
  legalEntityId: string
  seriesCode: string
  fiscalYear: string
}

export interface NumberSeriesPort {
  /**
   * Must execute, inside the caller's transaction:
   *
   *   UPDATE number_series SET next_value = next_value + 1
   *    WHERE ... RETURNING next_value - 1, format
   *
   * The row lock is held to commit. Returns null when the series does not exist.
   */
  allocate(key: NumberSeriesKey): Promise<{ value: number; format: string } | null>
}

export class NumberSeriesNotConfiguredError extends Error {
  readonly code = 'NUMBER_SERIES_NOT_CONFIGURED'
  constructor(key: NumberSeriesKey) {
    super(`No number series "${key.seriesCode}" for fiscal year ${key.fiscalYear}`)
  }
}

/**
 * Resolves a format template against an allocated value.
 *
 * Placeholders: `{FY}` and a run of `#` giving the zero-padded width.
 *   "INV/{FY}/{####}" + 42 + "2026-27"  ->  "INV/2026-27/0042"
 *
 * A value wider than the padding is NOT truncated — a number must never be
 * silently rewritten, even when the series was configured too narrow.
 */
export function formatDocumentNumber(format: string, value: number, fiscalYear: string): string {
  return format
    .replace(/\{FY\}/g, fiscalYear)
    .replace(/\{(#+)\}/g, (_match, hashes: string) =>
      String(value).padStart(hashes.length, '0'),
    )
}

export async function allocateDocumentNumber(
  port: NumberSeriesPort,
  key: NumberSeriesKey,
): Promise<string> {
  const allocated = await port.allocate(key)
  if (allocated === null) throw new NumberSeriesNotConfiguredError(key)
  return formatDocumentNumber(allocated.format, allocated.value, key.fiscalYear)
}
