import { describe, expect, it } from 'vitest'
import { habitListQueryFilters, shouldFetchAllHabitPages } from '../utils/habit-list-pagination-core'

const day = { dateFrom: '2026-08-28', dateTo: '2026-08-28' }

describe('habit list pagination for detail', () => {
  it('keeps a complete detail day in a separate cache and fetches later pages', () => {
    expect(habitListQueryFilters(day, true)).toEqual({ ...day, completeDay: true })
    expect(habitListQueryFilters(day, false)).toEqual(day)
    expect(shouldFetchAllHabitPages(day, true, 2)).toBe(true)
    expect(shouldFetchAllHabitPages(day, true, 1)).toBe(false)
  })

  it('keeps ordinary day lists on one page and loads unbounded lists completely', () => {
    expect(shouldFetchAllHabitPages(day, false, 2)).toBe(false)
    expect(shouldFetchAllHabitPages({}, false, 2)).toBe(true)
  })
})
