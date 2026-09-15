/**
 * Shade-continuity allocation.
 *
 * Fabric dyed in different lots is never exactly the same colour. Within a
 * shade band the difference is invisible; across bands it is not. A garment cut
 * from two bands shows a panel that does not match — and the defect appears
 * after cutting and sewing, when the value added is highest and the fabric can
 * no longer be returned.
 *
 * So allocation is not "find enough metres". It is "find enough metres the
 * cutter is allowed to use together". Generic ERPs allocate on quantity and
 * date; expressing this is why the textile pack exists.
 */

export interface ShadeCandidate {
  stockUnitId: string
  shadeBand: string
  availableMetres: number
  grade?: string
  /** Older stock first within a band, so nothing ages out unnoticed. */
  receivedAt?: Date
}

export type ShadePolicy =
  /** One band only. A cut plan for a single garment. */
  | 'SINGLE_BAND'
  /** Spread across as few bands as possible. Bulk orders cut in separate lays. */
  | 'MINIMISE_BANDS'
  /** Shade is irrelevant — linings, interlinings, wiping cloth. */
  | 'ANY'

export interface ShadeRequest {
  requiredMetres: number
  policy: ShadePolicy
  /** Only these grades may be used; empty means any. */
  acceptableGrades?: readonly string[]
}

export interface ShadeAllocation {
  stockUnitId: string
  shadeBand: string
  metres: number
}

export interface ShadeAllocationResult {
  allocations: ShadeAllocation[]
  /** Metres that could not be allocated under the policy. */
  shortfallMetres: number
  bandsUsed: string[]
  /**
   * Set when a policy blocked an allocation that raw quantity would have
   * allowed. The planner needs to know the difference between "no stock" and
   * "stock exists but not in one band".
   */
  blockedByPolicy: boolean
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000

const byAge = (a: ShadeCandidate, b: ShadeCandidate): number =>
  (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0)

function groupByBand(candidates: readonly ShadeCandidate[]): Map<string, ShadeCandidate[]> {
  const bands = new Map<string, ShadeCandidate[]>()
  for (const candidate of candidates) {
    const list = bands.get(candidate.shadeBand) ?? []
    list.push(candidate)
    bands.set(candidate.shadeBand, list)
  }
  for (const list of bands.values()) list.sort(byAge)
  return bands
}

const totalOf = (list: readonly ShadeCandidate[]): number =>
  round3(list.reduce((sum, c) => sum + c.availableMetres, 0))

function drawFrom(
  list: readonly ShadeCandidate[],
  metres: number,
): { allocations: ShadeAllocation[]; drawn: number } {
  const allocations: ShadeAllocation[] = []
  let left = metres
  for (const candidate of list) {
    if (left <= 0) break
    const take = round3(Math.min(left, candidate.availableMetres))
    if (take <= 0) continue
    allocations.push({
      stockUnitId: candidate.stockUnitId,
      shadeBand: candidate.shadeBand,
      metres: take,
    })
    left = round3(left - take)
  }
  return { allocations, drawn: round3(metres - left) }
}

export function allocateByShade(
  candidates: readonly ShadeCandidate[],
  request: ShadeRequest,
): ShadeAllocationResult {
  const eligible = candidates.filter(
    (c) =>
      c.availableMetres > 0 &&
      (request.acceptableGrades === undefined ||
        request.acceptableGrades.length === 0 ||
        (c.grade !== undefined && request.acceptableGrades.includes(c.grade))),
  )

  const empty = (blocked: boolean): ShadeAllocationResult => ({
    allocations: [],
    shortfallMetres: round3(request.requiredMetres),
    bandsUsed: [],
    blockedByPolicy: blocked,
  })

  if (request.requiredMetres <= 0) {
    return { allocations: [], shortfallMetres: 0, bandsUsed: [], blockedByPolicy: false }
  }
  if (eligible.length === 0) return empty(false)

  const bands = groupByBand(eligible)

  if (request.policy === 'SINGLE_BAND') {
    // Smallest band that can cover the whole requirement, so larger bands stay
    // whole for the next order rather than being nibbled at.
    const sufficient = [...bands.entries()]
      .filter(([, list]) => totalOf(list) >= request.requiredMetres)
      .sort(([, a], [, b]) => totalOf(a) - totalOf(b))

    const chosen = sufficient[0]
    if (chosen === undefined) {
      // Distinguish "not enough fabric" from "enough fabric, wrong bands" —
      // the second is a planning decision, not a purchasing one.
      return empty(totalOf(eligible) >= request.requiredMetres)
    }
    const { allocations } = drawFrom(chosen[1], request.requiredMetres)
    return {
      allocations,
      shortfallMetres: 0,
      bandsUsed: [chosen[0]],
      blockedByPolicy: false,
    }
  }

  // MINIMISE_BANDS and ANY both draw largest band first; that minimises the
  // number of bands touched, and for ANY it is simply a sensible default.
  const ordered = [...bands.entries()].sort(([, a], [, b]) => totalOf(b) - totalOf(a))

  const allocations: ShadeAllocation[] = []
  const bandsUsed: string[] = []
  let left = round3(request.requiredMetres)

  for (const [band, list] of ordered) {
    if (left <= 0) break
    const { allocations: drawnAllocations, drawn } = drawFrom(list, left)
    if (drawn <= 0) continue
    allocations.push(...drawnAllocations)
    bandsUsed.push(band)
    left = round3(left - drawn)
  }

  return { allocations, shortfallMetres: Math.max(0, left), bandsUsed, blockedByPolicy: false }
}
