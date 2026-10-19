import { describe, expect, it } from 'vitest'
import { buildHabitViewFilters, type HabitViewFiltersInput } from '../utils/habit-view-filters'

const selection: HabitViewFiltersInput = {
  dateStr: '2026-09-12',
  isTodayDate: true,
  searchQuery: '',
  selectedFrequency: null,
  selectedTagIds: [],
  showGeneralOnToday: false,
}

describe('habit view requests', () => {
  it('defaults to Hoje with overdue habits and no general habits', () => {
    expect(buildHabitViewFilters(selection)).toEqual({
      dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: true, includeGeneral: undefined,
    })
  })

  it('keeps search, frequency and tags when browsing a different day', () => {
    expect(buildHabitViewFilters({
      ...selection, view: 'today', isTodayDate: false, showGeneralOnToday: true,
      searchQuery: '  walk  ', selectedFrequency: 'Week', selectedTagIds: ['health'],
    })).toEqual({
      dateFrom: '2026-09-12', dateTo: '2026-09-12', includeOverdue: false,
      includeGeneral: true, search: 'walk', frequencyUnit: 'Week', tagIds: ['health'],
    })
  })

  it('requests Todos across every date and retains the selected filters', () => {
    expect(buildHabitViewFilters({
      ...selection, view: 'all', showGeneralOnToday: true,
      searchQuery: ' walk ', selectedFrequency: 'Day', selectedTagIds: ['health'],
    })).toEqual({ search: 'walk', frequencyUnit: 'Day', tagIds: ['health'] })
    expect(buildHabitViewFilters({ ...selection, view: 'all', searchQuery: '   ' })).toEqual({})
  })

  it.each([false, true])('requests Geral independently of the Hoje preference (%s) and frequency', (showGeneralOnToday) => {
    expect(buildHabitViewFilters({
      ...selection, view: 'general', showGeneralOnToday,
      searchQuery: ' read ', selectedFrequency: 'Month', selectedTagIds: ['learning'],
    })).toEqual({ isGeneral: true, search: 'read', tagIds: ['learning'] })
    expect(buildHabitViewFilters({ ...selection, view: 'general' })).toEqual({ isGeneral: true })
  })
})
