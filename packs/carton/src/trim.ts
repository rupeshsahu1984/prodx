/**
 * Corrugator trim optimisation.
 *
 * A corrugator runs a fixed deck width (the deckle). Every order has a sheet
 * width; whatever is left across the deck is trimmed off and sold as waste at a
 * fraction of its cost. Combining orders so the deck is filled is where the
 * money is — a point of trim on a plant running 1600 mm all day is a large
 * number by the end of a year.
 *
 * This is the cutting-stock problem. A full LP formulation is overkill for a
 * deck that physically fits four or five orders: exhaustive pattern generation
 * plus greedy selection finds the same answers here, runs in milliseconds, and
 * produces a plan a supervisor can read and override.
 */

export interface TrimOrder {
  id: string
  widthMm: number
  /** Linear metres of board still to produce. */
  requiredMetres: number
}

export interface TrimSlot {
  orderId: string
  /** How many times this order's width sits across the deck. */
  ups: number
}

export interface TrimPattern {
  combination: TrimSlot[]
  usedMm: number
  trimMm: number
  trimPct: number
  /** Linear metres to run this pattern for. */
  runMetres: number
}

export interface TrimPlanOptions {
  /**
   * Corrugators need a little edge trim; a pattern that fills the deck exactly
   * cannot actually be run on most machines.
   */
  minTrimMm?: number
  /** A pattern wasting more than this is not worth setting up. */
  maxTrimMm?: number
  /** How many distinct orders may share one pattern. */
  maxOrdersPerPattern?: number
  /** Physical limit on how many sheets fit across, independent of width. */
  maxUps?: number
}

export interface TrimPlan {
  deckleMm: number
  patterns: TrimPattern[]
  /** Weighted across every metre planned — the number the plant is judged on. */
  averageTrimPct: number
  totalMetres: number
  /** Orders no feasible pattern could cover, with what is left. */
  unfulfilled: Array<{ orderId: string; remainingMetres: number }>
}

const DEFAULTS = {
  minTrimMm: 10,
  maxTrimMm: 120,
  maxOrdersPerPattern: 3,
  maxUps: 8,
} as const

/** Every way orders can be laid across the deck within the constraints. */
export function generatePatterns(
  deckleMm: number,
  orders: readonly TrimOrder[],
  options: TrimPlanOptions = {},
): Array<Omit<TrimPattern, 'runMetres'>> {
  const { minTrimMm, maxTrimMm, maxOrdersPerPattern, maxUps } = { ...DEFAULTS, ...options }
  const usable = orders.filter((o) => o.widthMm > 0 && o.widthMm <= deckleMm - minTrimMm)
  const patterns: Array<Omit<TrimPattern, 'runMetres'>> = []
  const seen = new Set<string>()

  const walk = (index: number, slots: TrimSlot[], usedMm: number, distinct: number): void => {
    if (slots.length > 0) {
      const trimMm = deckleMm - usedMm
      if (trimMm >= minTrimMm && trimMm <= maxTrimMm) {
        // Slots are generated in index order, so the key is already canonical.
        const key = slots.map((s) => `${s.orderId}x${s.ups}`).join('|')
        if (!seen.has(key)) {
          seen.add(key)
          patterns.push({
            combination: slots.map((s) => ({ ...s })),
            usedMm,
            trimMm,
            trimPct: round3((trimMm / deckleMm) * 100),
          })
        }
      }
    }
    if (index >= usable.length || distinct >= maxOrdersPerPattern) return

    const order = usable[index]
    if (order === undefined) return

    // Skip this order entirely, then try it at increasing ups.
    walk(index + 1, slots, usedMm, distinct)

    const totalUps = slots.reduce((sum, s) => sum + s.ups, 0)
    for (let ups = 1; ups <= maxUps - totalUps; ups++) {
      const width = usedMm + order.widthMm * ups
      if (width > deckleMm - minTrimMm) break
      walk(index + 1, [...slots, { orderId: order.id, ups }], width, distinct + 1)
    }
  }

  walk(0, [], 0, 0)
  return patterns.sort((a, b) => a.trimMm - b.trimMm)
}

/**
 * Chooses patterns greedily by least trim, running each only as far as its
 * scarcest order allows.
 *
 * Greedy is the right shape here because a supervisor reads the result: the
 * plan is a short list of set-ups ordered by how good they are, and the first
 * one is always the best available. An optimal LP solution that needs eleven
 * set-ups to save half a point of trim is not a plan anyone runs.
 */
export function planTrim(
  deckleMm: number,
  orders: readonly TrimOrder[],
  options: TrimPlanOptions = {},
): TrimPlan {
  const remaining = new Map(orders.map((o) => [o.id, o.requiredMetres]))
  const patterns = generatePatterns(deckleMm, orders, options)
  const chosen: TrimPattern[] = []

  for (const pattern of patterns) {
    // The pattern can only run as far as its most nearly finished order.
    const limit = Math.min(
      ...pattern.combination.map((slot) => {
        const left = remaining.get(slot.orderId) ?? 0
        return left / slot.ups
      }),
    )
    if (!Number.isFinite(limit) || limit <= 0) continue

    const runMetres = round3(limit)
    for (const slot of pattern.combination) {
      const left = remaining.get(slot.orderId) ?? 0
      remaining.set(slot.orderId, round3(Math.max(0, left - runMetres * slot.ups)))
    }
    chosen.push({ ...pattern, runMetres })

    if ([...remaining.values()].every((v) => v <= 0)) break
  }

  const totalMetres = round3(chosen.reduce((sum, p) => sum + p.runMetres, 0))
  const weightedTrim = chosen.reduce((sum, p) => sum + p.trimPct * p.runMetres, 0)

  return {
    deckleMm,
    patterns: chosen,
    averageTrimPct: totalMetres === 0 ? 0 : round3(weightedTrim / totalMetres),
    totalMetres,
    unfulfilled: [...remaining.entries()]
      .filter(([, left]) => left > 0)
      .map(([orderId, remainingMetres]) => ({ orderId, remainingMetres })),
  }
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000
