import { describe, expect, it } from 'vitest'
import { buildYearRange } from '../utils/year-range'

describe('buildYearRange', () => {
  it('returns a contiguous ascending span centered on the given year', () => {
    const years = buildYearRange(2026)

    expect(years[0]).toBe(2014)
    expect(years[years.length - 1]).toBe(2038)
    expect(years).toContain(2026)
  })

  it('keeps the center year in the exact middle of the span', () => {
    const years = buildYearRange(2026)

    expect(years).toHaveLength(25)
    expect(years[Math.floor(years.length / 2)]).toBe(2026)
  })

  it('produces strictly increasing consecutive years', () => {
    const years = buildYearRange(2000)

    for (let index = 1; index < years.length; index += 1) {
      expect(years[index]! - years[index - 1]!).toBe(1)
    }
  })
})
