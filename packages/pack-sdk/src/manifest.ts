/**
 * What an industry pack declares about itself (ADR 0009).
 *
 * Core reads this to build navigation, permissions, document types and item
 * categories. Adding a pack therefore requires no edit to core — if you find
 * yourself writing `if (packId === 'textile')` anywhere outside a pack, the
 * manifest is missing a field.
 */

export interface PackDocumentType {
  /** Stable code used for number series and audit, e.g. `TRIM_PLAN`. */
  code: string
  name: string
  /** Placeholders as in ADR 0008: {FY} and a run of #. */
  numberFormat: string
}

export interface PackItemCategory {
  code: string
  name: string
  /** Characteristics the pack expects on items of this category. */
  characteristics: readonly PackCharacteristic[]
}

export interface PackCharacteristic {
  code: string
  name: string
  type: 'text' | 'number' | 'select'
  options?: readonly string[]
  required?: boolean
  /** Unit shown beside the value, e.g. GSM or mm. */
  unit?: string
}

export interface PackNavigationEntry {
  /** Domain heading it appears under, matching the prototype's grouping. */
  group: string
  label: string
  path: string
  permission: string
}

export interface PackManifest {
  /** Lowercase, stable, used in URLs, permissions and the RLS predicate. */
  id: string
  name: string
  version: string
  description: string

  permissions: readonly string[]
  documentTypes: readonly PackDocumentType[]
  itemCategories: readonly PackItemCategory[]
  navigation: readonly PackNavigationEntry[]

  /**
   * Tables this pack owns. Used by the uninstall guard to decide whether the
   * pack still holds data, and by the RLS generator to gate them. Listing a
   * table here that the pack does not own would hide another pack's data.
   */
  tables: readonly string[]
}

export class DuplicatePackError extends Error {
  readonly code = 'DUPLICATE_PACK'
  constructor(id: string) {
    super(`Pack "${id}" is already registered.`)
  }
}

export class UnknownPackError extends Error {
  readonly code = 'UNKNOWN_PACK'
  constructor(id: string) {
    super(`No pack named "${id}" is available in this build.`)
  }
}

const ID_PATTERN = /^[a-z][a-z0-9_]{1,30}$/

export function assertValidManifest(manifest: PackManifest): void {
  if (!ID_PATTERN.test(manifest.id)) {
    throw new Error(`Pack id "${manifest.id}" must be lowercase letters, digits and underscores.`)
  }
  // The id becomes part of a SQL predicate and of permission strings, so a
  // loose id is not a cosmetic problem.
  const prefixed = manifest.tables.every((t) => t.startsWith(`${manifest.id}_`))
  if (!prefixed) {
    throw new Error(
      `Pack "${manifest.id}" declares tables outside its own prefix. ` +
        'A pack may only own tables named <id>_*, so one pack can never gate another’s data.',
    )
  }
}
