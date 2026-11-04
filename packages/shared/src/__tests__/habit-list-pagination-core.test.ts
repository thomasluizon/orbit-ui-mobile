import { describe, expect, it } from 'vitest'
import { adjacentHabitDayFilters } from '../query/habit-list'
import { habitListQueryFilters, habitViewQueryOptions, shouldFetchAllHabitPages } from '../utils/habit-list-pagination-core'

const day = { dateFrom: '2026-08-28', dateTo: '2026-08-28' }

describe('habit list pagination for detail', () => {
  it.each([
    { view: 'today', completeDay: true, scheduleDate: undefined },
    { view: 'all', completeDay: false, scheduleDate: day.dateFrom },
    { view: 'general', completeDay: false, scheduleDate: undefined },
  ] as const)('keeps the $view query in its own cache with the right schedule enrichment', ({ view, completeDay, scheduleDate }) => {
    const options = habitViewQueryOptions(view, day.dateFrom)
    expect(options).toEqual({ completeDay, scheduleDate, prefetchAroundToday: view === 'today' ? day.dateFrom : undefined })
    expect(habitListQueryFilters({}, options.completeDay, options.scheduleDate)).toEqual(
      view === 'today' ? { completeDay: true } : view === 'all' ? { scheduleDate: day.dateFrom } : {},
    )
  })

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


describe('adjacent habit days', () => {
  it.each([
    ['2026-01-01', '2025-12-31', '2026-01-02'],
    ['2024-03-01', '2024-02-29', '2024-03-02'],
    ['2026-11-01', '2026-10-31', '2026-11-02'],
  ])('preserves filters across the boundaries around %s', (date, previous, next) => {
    const filters = { dateFrom: date, dateTo: date, includeOverdue: false, includeGeneral: true,
      frequencyUnit: 'Month' as const, tagIds: ['tag'], search: 'Read', isCompleted: false }
    expect(adjacentHabitDayFilters(filters, previous!)).toEqual([
      { ...filters, dateFrom: previous, dateTo: previous, includeOverdue: true },
      { ...filters, dateFrom: next, dateTo: next, includeOverdue: false },
    ])
  })

  it('does not turn inventories or date ranges into day queries', () => {
    expect(adjacentHabitDayFilters({}, day.dateFrom)).toEqual([])
    expect(adjacentHabitDayFilters({ isGeneral: true, ...day }, day.dateFrom)).toEqual([])
    expect(adjacentHabitDayFilters({ ...day, dateTo: '2026-08-29' }, day.dateFrom)).toEqual([])
  })
})
