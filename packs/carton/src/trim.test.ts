import { describe, expect, it } from 'vitest'
import { generatePatterns, planTrim, type TrimOrder } from './trim'

const order = (id: string, widthMm: number, requiredMetres = 1000): TrimOrder => ({
  id,
  widthMm,
  requiredMetres,
})

describe('generatePatterns', () => {
  it('lays a single order across the deck at several ups', () => {
    const patterns = generatePatterns(1600, [order('a', 500)])
    // 2-up uses 1000 (trim 600, too much); 3-up uses 1500, trim 100 — feasible.
    expect(patterns.map((p) => p.combination[0]?.ups)).toEqual([3])
    expect(patterns[0]?.trimMm).toBe(100)
  })

  it('finds the tightest lay-up available, mixed or not', () => {
    // 790 x 2 = 1580 (trim 20) beats 780 + 790 = 1570 (trim 30). The solver is
    // expected to find that; an earlier version of this test asserted the
    // mixed pattern because it is the obvious one, which was simply wrong.
    const patterns = generatePatterns(1600, [order('a', 780), order('b', 790)])
    expect(patterns[0]?.trimMm).toBe(20)
    expect(patterns[0]?.combination).toEqual([{ orderId: 'b', ups: 2 }])
  })

  it('does generate mixed patterns, and ranks them by trim', () => {
    const patterns = generatePatterns(1600, [order('a', 780), order('b', 790)])
    const mixed = patterns.find((p) => p.combination.length === 2)
    expect(mixed?.trimMm).toBe(30)
    expect(patterns.indexOf(mixed!)).toBeGreaterThan(0)
  })

  it('finds a combination that is the only feasible option', () => {
    // 900 alone wastes 700; 650 x 2 wastes 300; only 900 + 650 fits the limit.
    const patterns = generatePatterns(1600, [order('a', 900), order('b', 650)])
    expect(patterns).toHaveLength(1)
    expect(patterns[0]?.trimMm).toBe(50)
    expect(patterns[0]?.combination.map((c) => c.orderId).sort()).toEqual(['a', 'b'])
  })

  it('respects the minimum edge trim', () => {
    // 800 x 2 = 1600 fills the deck exactly, which no corrugator can run.
    const patterns = generatePatterns(1600, [order('a', 800)], { minTrimMm: 10 })
    expect(patterns.every((p) => p.trimMm >= 10)).toBe(true)
    expect(patterns.some((p) => p.trimMm === 0)).toBe(false)
  })

  it('discards a pattern wasting more than the plant accepts', () => {
    expect(generatePatterns(1600, [order('a', 500)], { maxTrimMm: 50 })).toEqual([])
  })

  it('ignores an order wider than the deck', () => {
    expect(generatePatterns(1600, [order('a', 1700)])).toEqual([])
  })

  it('honours the physical limit on sheets across the deck', () => {
    const patterns = generatePatterns(1600, [order('a', 150)], { maxUps: 4, maxTrimMm: 1200 })
    expect(Math.max(...patterns.map((p) => p.combination[0]?.ups ?? 0))).toBeLessThanOrEqual(4)
  })

  it('returns patterns best-first', () => {
    const patterns = generatePatterns(1600, [order('a', 780), order('b', 790), order('c', 520)])
    const trims = patterns.map((p) => p.trimMm)
    expect([...trims].sort((x, y) => x - y)).toEqual(trims)
  })

  it('does not emit the same combination twice', () => {
    const patterns = generatePatterns(1600, [order('a', 400), order('b', 400)])
    const keys = patterns.map((p) => p.combination.map((c) => `${c.orderId}x${c.ups}`).join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('planTrim', () => {
  it('covers the demand and reports weighted trim', () => {
    const plan = planTrim(1600, [order('a', 780, 1000), order('b', 790, 1000)])
    expect(plan.unfulfilled).toEqual([])
    expect(plan.patterns[0]?.trimMm).toBe(20)
    // Weighted by metres run, not a mean of the patterns: a pattern run for
    // 50 m must not count as much as one run for 500 m.
    const weighted =
      plan.patterns.reduce((sum, p) => sum + p.trimPct * p.runMetres, 0) / plan.totalMetres
    expect(plan.averageTrimPct).toBeCloseTo(weighted, 3)
  })

  it('runs a pattern only as far as its scarcest order allows', () => {
    // The best pattern is b x 2, so 200 m of b is exhausted by a 100 m run.
    const plan = planTrim(1600, [order('a', 780, 1000), order('b', 790, 200)])
    expect(plan.patterns[0]).toMatchObject({ runMetres: 100 })
    expect(plan.unfulfilled.map((u) => u.orderId)).not.toContain('b')
  })

  it('reports what it could not cover rather than pretending', () => {
    // A lone 900 mm order leaves 700 mm of trim, beyond any sane limit.
    const plan = planTrim(1600, [order('a', 900, 500)], { maxTrimMm: 120 })
    expect(plan.patterns).toEqual([])
    expect(plan.unfulfilled).toEqual([{ orderId: 'a', remainingMetres: 500 }])
  })

  it('sets up the best pattern first', () => {
    const plan = planTrim(1600, [
      order('tight_a', 780, 500),
      order('tight_b', 790, 500),
      order('loose', 700, 500),
    ])
    const trims = plan.patterns.map((p) => p.trimMm)
    expect(trims[0]).toBe(Math.min(...trims))
  })

  it('beats running each order on its own', () => {
    // The whole justification for the module, asserted rather than assumed.
    // Widths chosen so neither order can be run alone within the trim limit.
    const orders = [order('a', 900, 1000), order('b', 650, 1000)]
    const combined = planTrim(1600, orders)
    expect(combined.unfulfilled).toEqual([])
    expect(combined.averageTrimPct).toBeCloseTo(3.125, 3)

    for (const single of orders) {
      expect(planTrim(1600, [single]).patterns).toEqual([])
    }
  })

  it('returns an empty plan for no orders instead of dividing by zero', () => {
    const plan = planTrim(1600, [])
    expect(plan).toMatchObject({ patterns: [], averageTrimPct: 0, totalMetres: 0 })
  })
})
