import { describe, expect, it } from 'vitest'
import { allocateByShade, type ShadeCandidate } from './shade-allocation'

const roll = (
  id: string,
  shadeBand: string,
  availableMetres: number,
  extra: Partial<ShadeCandidate> = {},
): ShadeCandidate => ({ stockUnitId: id, shadeBand, availableMetres, ...extra })

describe('allocateByShade', () => {
  describe('SINGLE_BAND', () => {
    it('draws the whole requirement from exactly one band', () => {
      // Which band is the next test's business; this one asserts only that the
      // allocation does not straddle two, which is the rule that matters.
      const result = allocateByShade(
        [roll('r1', 'A1', 300), roll('r2', 'A1', 300), roll('r3', 'B2', 500)],
        { requiredMetres: 500, policy: 'SINGLE_BAND' },
      )
      expect(result.bandsUsed).toHaveLength(1)
      expect(new Set(result.allocations.map((a) => a.shadeBand)).size).toBe(1)
      expect(result.allocations.reduce((s, a) => s + a.metres, 0)).toBe(500)
      expect(result.shortfallMetres).toBe(0)
    })

    it('can span several rolls so long as they share a band', () => {
      const result = allocateByShade([roll('r1', 'A1', 300), roll('r2', 'A1', 300)], {
        requiredMetres: 500,
        policy: 'SINGLE_BAND',
      })
      expect(result.allocations).toHaveLength(2)
      expect(result.bandsUsed).toEqual(['A1'])
    })

    it('refuses to mix even when the total is plentiful', () => {
      // 400 metres exist, but split 200/200 across bands. Cutting across them
      // produces a garment with a visibly mismatched panel.
      const result = allocateByShade([roll('r1', 'A1', 200), roll('r2', 'B2', 200)], {
        requiredMetres: 400,
        policy: 'SINGLE_BAND',
      })
      expect(result.allocations).toEqual([])
      expect(result.shortfallMetres).toBe(400)
      // The planner must be able to tell this from "no fabric".
      expect(result.blockedByPolicy).toBe(true)
    })

    it('reports a genuine shortage as a shortage, not a policy block', () => {
      const result = allocateByShade([roll('r1', 'A1', 100)], {
        requiredMetres: 400,
        policy: 'SINGLE_BAND',
      })
      expect(result.blockedByPolicy).toBe(false)
    })

    it('uses the smallest band that fits, keeping larger bands whole', () => {
      const result = allocateByShade(
        [roll('big', 'A1', 5000), roll('snug', 'B2', 520)],
        { requiredMetres: 500, policy: 'SINGLE_BAND' },
      )
      expect(result.bandsUsed).toEqual(['B2'])
    })

    it('consumes older rolls first within the band', () => {
      const result = allocateByShade(
        [
          roll('new', 'A1', 300, { receivedAt: new Date('2026-09-01') }),
          roll('old', 'A1', 300, { receivedAt: new Date('2026-01-01') }),
        ],
        { requiredMetres: 300, policy: 'SINGLE_BAND' },
      )
      expect(result.allocations[0]?.stockUnitId).toBe('old')
    })
  })

  describe('MINIMISE_BANDS', () => {
    it('touches as few bands as possible', () => {
      const result = allocateByShade(
        [roll('r1', 'A1', 600), roll('r2', 'B2', 100), roll('r3', 'C3', 100)],
        { requiredMetres: 600, policy: 'MINIMISE_BANDS' },
      )
      expect(result.bandsUsed).toEqual(['A1'])
    })

    it('spills into a second band only when it must', () => {
      const result = allocateByShade([roll('r1', 'A1', 400), roll('r2', 'B2', 300)], {
        requiredMetres: 600,
        policy: 'MINIMISE_BANDS',
      })
      expect(result.bandsUsed).toEqual(['A1', 'B2'])
      expect(result.shortfallMetres).toBe(0)
    })

    it('reports the shortfall rather than over-allocating', () => {
      const result = allocateByShade([roll('r1', 'A1', 100)], {
        requiredMetres: 600,
        policy: 'MINIMISE_BANDS',
      })
      expect(result.allocations.reduce((s, a) => s + a.metres, 0)).toBe(100)
      expect(result.shortfallMetres).toBe(500)
    })
  })

  describe('grades and edge cases', () => {
    it('honours the acceptable grades', () => {
      const result = allocateByShade(
        [roll('a', 'A1', 500, { grade: 'B' }), roll('b', 'A1', 500, { grade: 'A' })],
        { requiredMetres: 400, policy: 'SINGLE_BAND', acceptableGrades: ['A'] },
      )
      expect(result.allocations.map((a) => a.stockUnitId)).toEqual(['b'])
    })

    it('treats an empty grade list as no restriction', () => {
      const result = allocateByShade([roll('a', 'A1', 500, { grade: 'B' })], {
        requiredMetres: 400,
        policy: 'ANY',
        acceptableGrades: [],
      })
      expect(result.shortfallMetres).toBe(0)
    })

    it('ignores rolls with nothing left on them', () => {
      const result = allocateByShade([roll('empty', 'A1', 0), roll('full', 'A1', 500)], {
        requiredMetres: 100,
        policy: 'ANY',
      })
      expect(result.allocations.map((a) => a.stockUnitId)).toEqual(['full'])
    })

    it('never allocates more than a roll holds', () => {
      const result = allocateByShade([roll('r1', 'A1', 120.5)], {
        requiredMetres: 500,
        policy: 'ANY',
      })
      expect(result.allocations[0]?.metres).toBe(120.5)
      expect(result.shortfallMetres).toBe(379.5)
    })

    it('handles a zero requirement without touching stock', () => {
      const result = allocateByShade([roll('r1', 'A1', 500)], {
        requiredMetres: 0,
        policy: 'SINGLE_BAND',
      })
      expect(result).toMatchObject({ allocations: [], shortfallMetres: 0 })
    })

    it('returns an empty result when there is no stock at all', () => {
      const result = allocateByShade([], { requiredMetres: 500, policy: 'SINGLE_BAND' })
      expect(result).toMatchObject({ shortfallMetres: 500, blockedByPolicy: false })
    })
  })
})
