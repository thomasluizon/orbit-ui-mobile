import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStreakWeekDays } from '../utils/streak-week'
import { buildProtectedDayLabels } from '../utils/progress'

const now = new Date(2026, 8, 7, 12)

describe('Progress streak history', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it.each([
    ['2026-09-09', '2026-09-08'],
    ['2026-09-08', '2026-09-07'],
  ])('matches the account date in history %j and follows timezone changes', (...dates) => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    const protectedDays = buildProtectedDayLabels(dates, 'en', true, 'America/Sao_Paulo')
    expect.soft(protectedDays.map(({ id, isToday }) => ({ id, isToday }))).toEqual(
      dates.map((id) => ({ id, isToday: id === '2026-09-08' })),
    )
    expect(buildProtectedDayLabels(dates, 'en', true, 'Pacific/Kiritimati').filter((day) => day.isToday).map((day) => day.id)).toEqual(
      dates.filter((date) => date === '2026-09-09'),
    )
    expect(buildProtectedDayLabels(dates, 'en', false, 'America/Sao_Paulo').every((day) => !day.isToday)).toBe(true)
  })

  it.each([undefined, null, 'unsupported/timezone', ''])('matches the UTC date without a usable account timezone (%j)', (timeZone) => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    const dates = ['2026-09-10', '2026-09-09', '2026-09-08']
    expect(buildProtectedDayLabels(dates, 'en', true, timeZone).map(({ id, isToday }) => ({ id, isToday }))).toEqual([
      { id: '2026-09-10', isToday: false },
      { id: '2026-09-09', isToday: true },
      { id: '2026-09-08', isToday: false },
    ])
    expect(buildProtectedDayLabels(dates, 'en', false, timeZone).every((day) => !day.isToday)).toBe(true)
  })

  it('labels a stored UTC calendar date as protected today for a null timezone', () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00Z'))
    expect(buildProtectedDayLabels(['2026-09-09'], 'en', true, null)).toEqual([
      { id: '2026-09-09', dateLabel: 'Sep 9', isToday: true },
    ])
  })

  it.each([
    [new Date('2026-09-08T00:30:00Z'), '2026-09-07', 'America/Sao_Paulo'],
    [new Date('2026-09-07T23:30:00Z'), '2026-09-08', 'Pacific/Kiritimati'],
  ] as const)('uses only account freeze dates across midnight with device time %s', (deviceNow, accountToday, timeZone) => {
    vi.setSystemTime(deviceNow)
    const dates = ['2026-09-04', accountToday, accountToday]
    const protectedDays = buildProtectedDayLabels(dates, 'en', true, timeZone)
    expect.soft(protectedDays.map((day) => day.id), 'must not invent a device date').toEqual([accountToday, '2026-09-04'])
    expect(protectedDays.find((day) => day.id === accountToday)?.isToday, 'today belongs to the account').toBe(true)
    expect(buildProtectedDayLabels(dates, 'en', false, timeZone).every((day) => !day.isToday)).toBe(true)
    expect(dates).toEqual(['2026-09-04', accountToday, accountToday])
  })

  it.each([
    ['', 'en'],
    ['not-a-date', 'en'],
    ['2026-02-30', 'en'],
    ['', undefined],
    ['not-a-date', undefined],
    ['2026-02-30', undefined],
  ] as const)('omits invalid protected date %j with locale %j while retaining valid history', (invalidDate, locale) => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const dates = [invalidDate, '2026-09-04', '2026-09-07']
    expect(buildProtectedDayLabels(dates, locale, true, 'America/Sao_Paulo')).toEqual([
      { id: '2026-09-07', dateLabel: locale ? 'Sep 7' : '2026-09-07', isToday: true },
      { id: '2026-09-04', dateLabel: locale ? 'Sep 4' : '2026-09-04', isToday: false },
    ])
    expect(buildProtectedDayLabels([invalidDate], locale)).toEqual([])
    expect(dates).toEqual([invalidDate, '2026-09-04', '2026-09-07'])
  })

  it('derives fourteen account days with all four states and keeps today open', () => {
    const days = buildStreakWeekDays({ lastActiveDate: '2026-09-06', recentFreezeDates: ['2026-09-04'] }, 4, false, now, 14)
    expect(days).toHaveLength(14)
    expect(days[0]?.dateStr).toBe('2026-08-25')
    expect(days.slice(-5).map((day) => day.status)).toEqual(['active', 'frozen', 'active', 'active', 'today'])
    expect(new Set(days.map((day) => day.status))).toEqual(new Set(['missed', 'active', 'frozen', 'today']))
  })

  it.each([
    [new Date('2026-09-09T01:00:00Z'), 'America/Sao_Paulo', '2026-09-08'],
    [new Date('2026-09-07T23:30:00Z'), 'Pacific/Kiritimati', '2026-09-08'],
  ] as const)('ends the timeline on account today across device midnight at %s', (deviceNow, timeZone, accountToday) => {
    const days = buildStreakWeekDays(
      { lastActiveDate: accountToday, recentFreezeDates: [accountToday] },
      1,
      true,
      deviceNow,
      14,
      timeZone,
    )

    expect(days.at(-1)).toMatchObject({
      dateStr: accountToday,
      status: 'frozen',
      isToday: true,
    })
    expect(days.filter((day) => day.isToday)).toHaveLength(1)
  })

  it('derives account dates independently of presentation order and separators', () => {
    const deviceNow = new Date('2026-09-09T01:00:00Z')
    const originalFormat = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format')
    if (!originalFormat) throw new Error('Intl.DateTimeFormat#format descriptor is unavailable')
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      configurable: true,
      get: () => () => '09/08/2026',
    })

    try {
      const days = buildStreakWeekDays(null, 0, false, deviceNow, 14, 'America/Sao_Paulo')
      expect(days.at(-1)?.dateStr).toBe('2026-09-08')

      vi.setSystemTime(deviceNow)
      expect(buildProtectedDayLabels(['2026-09-08'], undefined, true, 'America/Sao_Paulo')).toEqual([
        { id: '2026-09-08', dateLabel: '2026-09-08', isToday: true },
      ])
    } finally {
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', originalFormat)
    }
  })

  it.each([undefined, null, 'unsupported/timezone', ''])('ends the timeline on UTC today without a usable account timezone (%j)', (timeZone) => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-09-09', recentFreezeDates: ['2026-09-09'] },
      1,
      true,
      new Date('2026-09-09T01:00:00Z'),
      14,
      timeZone,
    )

    expect(days.at(-1)).toMatchObject({
      dateStr: '2026-09-09',
      status: 'frozen',
      isToday: true,
    })
  })
  it('includes protected today once and formats dates in the requested locale', () => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const dates = ['2026-09-04', '2026-09-07', '2026-09-07']
    const protectedDays = buildProtectedDayLabels(dates, 'en', true, 'America/Sao_Paulo')
    expect(protectedDays.map((day) => day.id)).toEqual(['2026-09-07', '2026-09-04'])
    expect(protectedDays[0]).toEqual({ id: '2026-09-07', dateLabel: 'Sep 7', isToday: true })
    expect(buildProtectedDayLabels(['2026-09-07'], 'pt-BR', true, 'America/Sao_Paulo')).toEqual([
      { id: '2026-09-07', dateLabel: '7 de set.', isToday: true },
    ])
    expect(buildProtectedDayLabels([], 'en', false)).toEqual([])
    expect(dates).toEqual(['2026-09-04', '2026-09-07', '2026-09-07'])
  })
})
