/**
 * Permission checking.
 *
 * Permissions are `domain:action` strings, e.g. `purchase_order:approve`.
 * A role may hold `purchase_order:*` for every action in a domain, or `*` for
 * everything. Wildcards expand only at segment boundaries: `purchase_order:*`
 * never matches `purchase_order_draft:read`.
 */

export type Permission = string

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN'
  constructor(required: Permission) {
    // Names the permission, not the record. Telling the caller a record exists
    // but is out of reach is itself a disclosure.
    super(`Missing permission: ${required}`)
  }
}

function matches(granted: Permission, required: Permission): boolean {
  if (granted === '*') return true
  if (granted === required) return true

  const g = granted.split(':')
  const r = required.split(':')
  if (g.length !== r.length) return false

  return g.every((segment, i) => segment === '*' || segment === r[i])
}

export function hasPermission(granted: readonly Permission[], required: Permission): boolean {
  return granted.some((g) => matches(g, required))
}

export function assertPermission(granted: readonly Permission[], required: Permission): void {
  if (!hasPermission(granted, required)) throw new ForbiddenError(required)
}

/**
 * Maker-checker: whoever created or last submitted a document may not approve it
 * (ADR to follow; gap 10). Holding the approval permission is necessary, never
 * sufficient.
 */
export class SegregationOfDutiesError extends Error {
  readonly code = 'SEGREGATION_OF_DUTIES'
  constructor() {
    super('You cannot approve a document you submitted. Another approver must act.')
  }
}

export function assertDifferentPerson(submittedBy: string, approver: string): void {
  if (submittedBy === approver) throw new SegregationOfDutiesError()
}
