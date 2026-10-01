import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { formatStreakRepairDates } from '@orbit/shared/utils/progress'
import { buildHabitUnderstandingSentence } from '@orbit/shared/utils/habit-form-helpers'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

vi.mock('../lib/sentry-init', () => ({}))
vi.mock('expo-router/entry', async () => {
  const { formatStreakRepairDates } = await import('@orbit/shared/utils/progress')
  expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], 'en'))
    .toBe('Thursday, Oct 1 and Friday, Oct 2')
  return {}
})

const nativeIntl = Object.getOwnPropertyDescriptors(Intl)

beforeAll(async () => {
  for (const name of ['ListFormat', 'Locale', 'getCanonicalLocales']) {
    Reflect.deleteProperty(Intl, name)
  }
  const entryPath = '../index.js'
  await import(entryPath)
})

afterAll(() => {
  Object.defineProperties(Intl, nativeIntl)
})

describe.each([
  {
    locale: 'en',
    messages: en,
    dates: 'Thursday, Oct 1 and Friday, Oct 2',
    pair: 'Monday and Wednesday',
    triple: 'Monday, Wednesday and Friday',
  },
  {
    locale: 'pt-BR',
    messages: ptBR,
    dates: 'quinta-feira, 1 de out. e sexta-feira, 2 de out.',
    pair: 'segunda e quarta',
    triple: 'segunda, quarta e sexta',
  },
])('mobile Intl startup in $locale', ({ locale, messages, dates, pair, triple }) => {
  it('formats repair dates without a native ListFormat', () => {
    expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], locale)).toBe(dates)
    expect(formatStreakRepairDates(['2026-10-01'], locale)).toBe(dates.split(locale === 'en' ? ' and ' : ' e ')[0])
    expect(formatStreakRepairDates([], locale)).toBe('')
  })

  it('formats two and three selected weekdays using the shipped translations', () => {
    const dayOptions = [
      { value: 'Monday', label: messages.dates.daysLong.monday },
      { value: 'Wednesday', label: messages.dates.daysLong.wednesday },
      { value: 'Friday', label: messages.dates.daysLong.friday },
    ]
    const translate = (key: string, values?: Record<string, string | number>) => {
      const template = key.split('.').reduce<unknown>(
        (catalog, segment) => (catalog as Record<string, unknown>)[segment], messages,
      ) as string
      return Object.entries(values ?? {}).reduce(
        (sentence, [name, value]) => sentence.replace(`{${name}}`, String(value)),
        template,
      )
    }
    expect(buildHabitUnderstandingSentence(
      ['Monday', 'Wednesday'], dayOptions, false, 'Day', 1, '', locale, translate,
    )).toBe(messages.habits.form.understoodDays.replace('{days}', pair))
    expect(buildHabitUnderstandingSentence(
      ['Monday', 'Wednesday', 'Friday'], dayOptions, false, 'Day', 1, '08:00', locale, translate,
    )).toBe(messages.habits.form.understoodDaysAt.replace('{days}', triple).replace('{time}', '08:00'))
  })

  it('rejects malformed locales', () => {
    expect(() => formatStreakRepairDates([], 'invalid_locale')).toThrow(RangeError)
    expect(() => buildHabitUnderstandingSentence(
      ['Monday', 'Wednesday'],
      [{ value: 'Monday', label: messages.dates.daysLong.monday },
        { value: 'Wednesday', label: messages.dates.daysLong.wednesday }],
      false, 'Day', 1, '', 'invalid_locale', (key) => key,
    )).toThrow(RangeError)
  })
})
