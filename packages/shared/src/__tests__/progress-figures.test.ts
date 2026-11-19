import { describe, expect, it } from 'vitest'
import { changedProgressFigures, parseProgressFigures, readProgressFigures } from '../utils/progress-figures'

const metrics = { completionRate: 74.6, activeDays: 12, weeklyConsistency: [10, 20, 30, 80, 50, 60, 70] }

describe('progress figures', () => {
  it('reads the three root figures as the person sees them', () => {
    expect(readProgressFigures(metrics)).toEqual({ completionRate: 75, activeDays: 12, bestWeekday: 'thursday' })
    expect(readProgressFigures({ ...metrics, weeklyConsistency: [] }).bestWeekday).toBeNull()
  })

  it('changes nothing on a first visit', () => {
    expect([...changedProgressFigures(null, readProgressFigures(metrics))]).toEqual([])
  })

  it('names only the figures that differ from the last visit', () => {
    const previous = readProgressFigures(metrics)
    expect([...changedProgressFigures(previous, readProgressFigures({ ...metrics, activeDays: 13 }))]).toEqual(['activeDays'])
    expect([...changedProgressFigures(previous, previous)]).toEqual([])
  })

  it('reads a stored value back and treats anything else as a first visit', () => {
    expect(parseProgressFigures({ completionRate: 75, activeDays: 12, bestWeekday: null })).toEqual({ completionRate: 75, activeDays: 12, bestWeekday: null })
    expect(parseProgressFigures({ completionRate: 75 })).toBeNull()
    expect(parseProgressFigures('75')).toBeNull()
    expect(parseProgressFigures(undefined)).toBeNull()
  })
})
