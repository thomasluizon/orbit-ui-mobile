import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isToday } from 'date-fns'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import { buildTodayFilters, type TodayFiltersInput } from '@/app/(app)/today-model'

function inputOf(overrides: Partial<TodayFiltersInput> = {}): TodayFiltersInput {
  return {
    view: 'today',
    dateStr: '2026-07-08',
    isTodayDate: true,
    searchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    showGeneralOnToday: false,
    ...overrides,
  }
}

describe('buildTodayFilters', () => {
  it('builds a general-view filter with only isGeneral by default', () => {
    expect(buildTodayFilters(inputOf({ view: 'general' }))).toEqual({ isGeneral: true })
  })

  it('adds trimmed search and tags to a general-view filter, ignoring frequency', () => {
    expect(
      buildTodayFilters(
        inputOf({
          view: 'general',
          searchQuery: '  run  ',
          selectedFrequency: 'Day',
          selectedTagIds: ['t1', 't2'],
        }),
      ),
    ).toEqual({ isGeneral: true, search: 'run', tagIds: ['t1', 't2'] })
  })

  it('builds a today-view filter with the date window and overdue flag', () => {
    expect(buildTodayFilters(inputOf({ view: 'today', isTodayDate: true }))).toEqual({
      dateFrom: '2026-07-08',
      dateTo: '2026-07-08',
      includeOverdue: true,
      includeGeneral: undefined,
    })
  })

  it('sets includeGeneral only when showGeneralOnToday is true', () => {
    expect(
      buildTodayFilters(inputOf({ view: 'today', showGeneralOnToday: true })).includeGeneral,
    ).toBe(true)
    expect(
      buildTodayFilters(inputOf({ view: 'today', showGeneralOnToday: false })).includeGeneral,
    ).toBeUndefined()
  })

  it('excludes overdue for a non-today date', () => {
    expect(
      buildTodayFilters(inputOf({ view: 'today', isTodayDate: false })).includeOverdue,
    ).toBe(false)
  })

  it('applies search, frequency, and tags to a today-view filter', () => {
    expect(
      buildTodayFilters(
        inputOf({
          view: 'today',
          searchQuery: 'walk',
          selectedFrequency: 'Week',
          selectedTagIds: ['a'],
        }),
      ),
    ).toEqual({
      dateFrom: '2026-07-08',
      dateTo: '2026-07-08',
      includeOverdue: true,
      includeGeneral: undefined,
      search: 'walk',
      frequencyUnit: 'Week',
      tagIds: ['a'],
    })
  })

  it('builds an empty filter for other views and applies optional selections', () => {
    expect(buildTodayFilters(inputOf({ view: 'all' }))).toEqual({})
    expect(
      buildTodayFilters(
        inputOf({ view: 'all', searchQuery: 'x', selectedFrequency: 'Month', selectedTagIds: ['z'] }),
      ),
    ).toEqual({ search: 'x', frequencyUnit: 'Month', tagIds: ['z'] })
  })

  it('drops whitespace-only search', () => {
    expect(buildTodayFilters(inputOf({ view: 'all', searchQuery: '   ' })).search).toBeUndefined()
  })
})

function withTimeZone<T>(timeZone: string, run: () => T): T {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}

function dayWindowForMoment(moment: Date) {
  const filter = buildTodayFilters(inputOf({ view: 'today', dateStr: formatAPIDate(moment) }))
  return { dateFrom: filter.dateFrom, dateTo: filter.dateTo }
}

function todayFilterForMoment(moment: Date) {
  return buildTodayFilters(
    inputOf({ view: 'today', dateStr: formatAPIDate(moment), isTodayDate: isToday(moment) }),
  )
}

describe('buildTodayFilters local-day bucketing at midnight', () => {
  it('buckets a moment exactly at local midnight into that calendar day', () => {
    expect(dayWindowForMoment(new Date(2026, 6, 8, 0, 0, 0, 0))).toEqual({
      dateFrom: '2026-07-08',
      dateTo: '2026-07-08',
    })
  })

  it('keeps the final millisecond of a day inside that day, not the next', () => {
    expect(dayWindowForMoment(new Date(2026, 6, 8, 23, 59, 59, 999))).toEqual({
      dateFrom: '2026-07-08',
      dateTo: '2026-07-08',
    })
  })

  it('rolls a moment one millisecond later into the next calendar day', () => {
    const before = dayWindowForMoment(new Date(2026, 6, 8, 23, 59, 59, 999))
    const after = dayWindowForMoment(new Date(2026, 6, 9, 0, 0, 0, 0))
    expect(before.dateFrom).toBe('2026-07-08')
    expect(after.dateFrom).toBe('2026-07-09')
    expect(before.dateFrom).not.toBe(after.dateFrom)
  })

  it('keeps a late-evening moment in the current day (classic off-by-one guard)', () => {
    expect(dayWindowForMoment(new Date(2026, 6, 7, 23, 59, 0, 0)).dateFrom).toBe('2026-07-07')
  })
})

describe('buildTodayFilters includeOverdue tracks the local today across midnight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes overdue while the wall clock still reads the selected day', () => {
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 0))
    const filter = todayFilterForMoment(new Date(2026, 6, 8, 23, 59, 59, 999))
    expect(filter.dateFrom).toBe('2026-07-08')
    expect(filter.includeOverdue).toBe(true)
  })

  it('drops overdue once the selected date is tomorrow', () => {
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 0))
    const filter = todayFilterForMoment(new Date(2026, 6, 9, 0, 0, 0, 0))
    expect(filter.dateFrom).toBe('2026-07-09')
    expect(filter.includeOverdue).toBe(false)
  })

  it('drops overdue for a past date even one millisecond after midnight', () => {
    vi.setSystemTime(new Date(2026, 6, 8, 0, 0, 0, 1))
    const filter = todayFilterForMoment(new Date(2026, 6, 7, 23, 59, 59, 999))
    expect(filter.dateFrom).toBe('2026-07-07')
    expect(filter.includeOverdue).toBe(false)
  })

  it('flips overdue for a fixed selected day as the clock itself crosses midnight', () => {
    const selectedDay = new Date(2026, 6, 8, 12, 0, 0)
    vi.setSystemTime(new Date(2026, 6, 8, 23, 59, 59, 500))
    const beforeMidnight = todayFilterForMoment(selectedDay)
    vi.setSystemTime(new Date(2026, 6, 9, 0, 0, 0, 1))
    const afterMidnight = todayFilterForMoment(selectedDay)

    expect(beforeMidnight.dateFrom).toBe('2026-07-08')
    expect(afterMidnight.dateFrom).toBe('2026-07-08')
    expect(beforeMidnight.includeOverdue).toBe(true)
    expect(afterMidnight.includeOverdue).toBe(false)
  })
})

describe('buildTodayFilters API-day parsing is timezone-stable', () => {
  it('round-trips API day strings through parseAPIDate in a negative UTC-offset zone', () => {
    withTimeZone('America/Sao_Paulo', () => {
      for (const day of ['2026-01-01', '2026-07-08', '2026-12-31']) {
        const filter = buildTodayFilters(
          inputOf({ view: 'today', dateStr: formatAPIDate(parseAPIDate(day)) }),
        )
        expect(filter.dateFrom).toBe(day)
        expect(filter.dateTo).toBe(day)
      }
    })
  })

  it('avoids the naive Date(apiDay) UTC drift that shifts the day backward', () => {
    withTimeZone('America/Sao_Paulo', () => {
      expect(formatAPIDate(new Date('2026-07-08'))).toBe('2026-07-07')
      expect(formatAPIDate(parseAPIDate('2026-07-08'))).toBe('2026-07-08')
    })
  })

  it('round-trips the day across spring-forward and fall-back DST transitions', () => {
    withTimeZone('America/New_York', () => {
      for (const day of ['2026-03-08', '2026-11-01']) {
        const filter = buildTodayFilters(
          inputOf({ view: 'today', dateStr: formatAPIDate(parseAPIDate(day)) }),
        )
        expect(filter.dateFrom).toBe(day)
      }
    })
  })

  it('keeps the calendar date stable across the DST hour shift', () => {
    withTimeZone('America/New_York', () => {
      expect(formatAPIDate(new Date(2026, 2, 8, 12, 0, 0))).toBe('2026-03-08')
      expect(formatAPIDate(new Date(2026, 10, 1, 12, 0, 0))).toBe('2026-11-01')
    })
  })
})
