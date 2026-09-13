import { describe, expect, it } from 'vitest'
import {
  buildRetrospectiveRequestUrl,
  getBestRetrospectiveWeekdayKey,
} from '../utils/retrospective'

describe('retrospective utils', () => {
  it('builds the retrospective request url with encoded params', () => {
    expect(buildRetrospectiveRequestUrl('semester', 'pt-BR')).toBe(
      '/api/habits/retrospective?period=semester&language=pt-BR',
    )
  })

  it('reads the producer\'s Monday-first weekly consistency values', () => {
    expect(getBestRetrospectiveWeekdayKey([10, 20, 30, 80, 50, 60, 70])).toBe('thursday')
    expect(getBestRetrospectiveWeekdayKey([90, 90, 20, 10, 0, 0, 0])).toBe('monday')
    expect(getBestRetrospectiveWeekdayKey([])).toBeNull()
    expect(getBestRetrospectiveWeekdayKey([0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
})
