import { describe, expect, it } from 'vitest'
import {
  capitalizeFirstLetter,
  resolveHourCycle,
  createTimeDisplay,
  formatLocaleDate,
  formatLocaleDayMonth,
  formatCalendarDayTitle,
  formatCalendarAgendaHeading,
  formatWeekdayLabels,
  formatLocaleDateTime,
  formatLocaleTime,
  resolveSupportedLocale,
  resolveSystemLocale,
  splitMonthYear,
} from '../utils/locale-format'

describe('locale-format utils', () => {
  it.each([
    ['en', 1, ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['en', 0, ['S', 'M', 'T', 'W', 'T', 'F', 'S']],
    ['pt-BR', 1, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']],
    ['pt-BR', 0, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']],
  ] as const)('formats visible weekday letters in %s starting on %i', (locale, weekStartsOn, labels) => {
    expect(formatWeekdayLabels(locale, weekStartsOn)).toEqual(labels)
  })

  it.each([
    ['en', 'September 30', 'Today, September 30', 'Tuesday, September 29'],
    ['pt-BR', '30 de setembro', 'Hoje, 30 de setembro', 'Terça-feira, 29 de setembro'],
  ])('formats the drawn date labels in %s', (locale, dateLabel, todayTitle, otherTitle) => {
    const todayLabel = (date: string) => (locale === 'en' ? 'Today, {date}' : 'Hoje, {date}').replace('{date}', date)
    expect(formatLocaleDayMonth('2026-09-30', locale)).toBe(dateLabel)
    expect(formatLocaleDayMonth(new Date(2026, 8, 30), locale)).toBe(dateLabel)
    expect(formatCalendarDayTitle('2026-09-30', locale, '2026-09-30', todayLabel)).toBe(todayTitle)
    expect(formatCalendarDayTitle('2026-09-29', locale, '2026-09-30', todayLabel)).toBe(otherTitle)
    expect(formatCalendarDayTitle('', locale, '2026-09-30', todayLabel)).toBe('')
    expect(formatLocaleDayMonth('invalid-date', locale)).toBe('invalid-date')
  })

  it.each(['en', 'pt-BR'])('keeps calendar date labels stable across device time zones in %s', (locale) => {
    const originalTimeZone = process.env.TZ
    const todayLabel = (date: string) => (locale === 'en' ? 'Today, {date}' : 'Hoje, {date}').replace('{date}', date)
    const expected = locale === 'en'
      ? ['September 30', 'Today, September 30', 'Tuesday, September 29']
      : ['30 de setembro', 'Hoje, 30 de setembro', 'Terça-feira, 29 de setembro']
    try {
      for (const timeZone of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
        process.env.TZ = timeZone
        expect([
          formatLocaleDayMonth('2026-09-30', locale),
          formatCalendarDayTitle('2026-09-30', locale, '2026-09-30', todayLabel),
          formatCalendarDayTitle('2026-09-29', locale, '2026-09-30', todayLabel),
        ], timeZone).toEqual(expected)
      }
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })

  it.each([
    ['en', 'Today, October 5'], ['pt-BR', 'Hoje, 5 de outubro'],
  ])('builds the day card today title through a complete template in %s', (locale, expected) => {
    const todayWithDate = (date: string) => (locale === 'en' ? 'Today, {date}' : 'Hoje, {date}').replace('{date}', date)
    expect(formatCalendarDayTitle('2026-10-05', locale, '2026-10-05', todayWithDate)).toBe(expected)
  })

  it.each([
    ['pt-BR', 'Hoje, segunda-feira, 5 de outubro', 'Terça-feira, 6 de outubro'],
    ['en', 'Today, Monday, October 5', 'Tuesday, October 6'],
  ])('formats the complete Agenda heading in %s', (locale, todayHeading, otherHeading) => {
    const template = (date: string) => (locale === 'en' ? 'Today, {date}' : 'Hoje, {date}').replace('{date}', date)
    expect(formatCalendarAgendaHeading('2026-10-05', locale, '2026-10-05', template)).toBe(todayHeading)
    expect(formatCalendarAgendaHeading('2026-10-06', locale, '2026-10-05', template)).toBe(otherHeading)
  })

  it('formats time for English locale', () => {
    expect(formatLocaleTime('14:30', 'en')).toBe('2:30 PM')
  })

  it('formats time for Portuguese locale', () => {
    expect(formatLocaleTime('14:30', 'pt-BR')).toBe('14:30')
  })

  it('detects locale-specific default time formats', () => {
    expect(resolveHourCycle(undefined, 'en')).toBe('h12')
    expect(resolveHourCycle(undefined, 'pt-BR')).toBe('h23')
    expect(resolveHourCycle(true, 'en')).toBe('h23')
    expect(resolveHourCycle(false, 'pt-BR')).toBe('h12')
  })

  it('builds one clock display for wire times and timestamps', () => {
    const twelveHour = createTimeDisplay('pt-BR', false)
    const twentyFourHour = createTimeDisplay('en', true)
    const localeDefault = createTimeDisplay('en', undefined)

    expect(twelveHour.hourCycle).toBe('h12')
    expect(twelveHour.displayTime('19:30')).toBe(formatLocaleTime('19:30', 'pt-BR', {
      hour: 'numeric', minute: '2-digit', hourCycle: 'h12',
    }))
    expect(twelveHour.displayClock('2026-04-06T19:30:00')).toBe(formatLocaleDateTime('2026-04-06T19:30:00', 'pt-BR', {
      hour: 'numeric', minute: '2-digit', hourCycle: 'h12',
    }))
    expect(twentyFourHour.hourCycle).toBe('h23')
    expect(twentyFourHour.displayTime('19:30')).toBe('19:30')
    expect(twentyFourHour.displayTime('08:00')).toBe('08:00')
    expect(createTimeDisplay('pt-BR', true).displayTime('08:00')).toBe('08:00')
    expect(twentyFourHour.displayClock('2026-04-06T00:05:00')).toBe('00:05')
    expect(localeDefault.hourCycle).toBe('h12')
    expect(twelveHour.displayTime(null)).toBe('')
  })

  it('maps Portuguese system locales to pt-BR', () => {
    expect(resolveSystemLocale('pt-PT')).toBe('pt-BR')
    expect(resolveSystemLocale('en-US')).toBe('en')
  })

  it('normalizes supported locales and formats dates', () => {
    expect(resolveSupportedLocale('pt-BR')).toBe('pt-BR')
    expect(resolveSupportedLocale('fr-FR')).toBe('en')

    expect(
      formatLocaleDate('2026-04-06', 'en', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    ).toBe(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.UTC(2026, 3, 6))),
    )
  })

  it('formats locale date-times and preserves invalid inputs', () => {
    expect(
      formatLocaleDateTime('2026-04-06T14:30:00Z', 'en', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ).toBe('04/06/2026, 02:30 PM')

    expect(formatLocaleDate('not-a-date', 'en')).toBe('not-a-date')
    expect(formatLocaleDateTime('not-a-date', 'en')).toBe('not-a-date')
    expect(formatLocaleTime('25:61', 'en')).toBe('25:61')
    expect(formatLocaleTime(null, 'en')).toBe('')
  })

  it('capitalizes only the first letter, leaving connectors lowercase', () => {
    expect(capitalizeFirstLetter('agosto de 2028')).toBe('Agosto de 2028')
    expect(capitalizeFirstLetter('August 2028')).toBe('August 2028')
    expect(capitalizeFirstLetter('')).toBe('')
  })

  it('splits a Portuguese month-year keeping the "de" connector lowercase', () => {
    expect(splitMonthYear('2028-08-15', 'pt-BR')).toEqual({
      lead: 'Agosto de',
      year: '2028',
    })
  })

  it('splits an English month-year with no connector', () => {
    expect(splitMonthYear('2028-08-15', 'en')).toEqual({
      lead: 'August',
      year: '2028',
    })
  })
})
