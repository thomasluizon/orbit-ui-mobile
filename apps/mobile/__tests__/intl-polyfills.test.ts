import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { formatStreakRepairDates } from '@orbit/shared/utils/progress'
import { buildHabitUnderstandingSentence } from '@orbit/shared/utils/habit-form-helpers'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const routerStartup = vi.hoisted(() => ({ repairMessage: '' }))

vi.mock('../lib/sentry-init', () => ({}))
vi.mock('expo-router/entry', async () => {
  const { formatStreakRepairDates } = await import('@orbit/shared/utils/progress')
  const { i18n } = await import('../lib/i18n')
  await i18n.changeLanguage('pt-BR')
  routerStartup.repairMessage = i18n.t('progressScreen.streak.gapBody', { count: 3 })
  expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], 'en'))
    .toBe('Thursday, Oct 1 and Friday, Oct 2')
  return {}
})

const nativeIntl = Object.getOwnPropertyDescriptors(Intl)
let i18n: typeof import('../lib/i18n').i18n

type MessageCatalog = { [key: string]: string | MessageCatalog }

function collectIcuMessages(catalog: MessageCatalog, prefix = ''): { key: string; template: string }[] {
  return Object.entries(catalog).flatMap(([name, message]) => {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof message !== 'string') return collectIcuMessages(message, key)
    return /,\s*(plural|select|selectordinal)\s*,/.test(message) ? [{ key, template: message }] : []
  })
}

function messageValues(count: number) {
  return { count, days: count, needed: count, banked: count, overage: count,
    streak: 4, limit: 80, time: '08:00', date: 'Oct 1' }
}

beforeAll(async () => {
  for (const name of ['PluralRules', 'ListFormat', 'Locale', 'getCanonicalLocales']) {
    Reflect.deleteProperty(Intl, name)
  }
  const entryPath = '../index.js'
  await import(entryPath)
  i18n = (await import('../lib/i18n')).i18n
})

afterAll(() => {
  Object.defineProperties(Intl, nativeIntl)
})

it('formats plurals before the router starts', () => {
  expect(routerStartup.repairMessage).toBe('3 dias sem registro. Os hábitos continuam como estavam.')
})

describe.each([
  {
    locale: 'en',
    messages: en,
    dates: 'Thursday, Oct 1 and Friday, Oct 2',
    pair: 'Monday and Wednesday',
    triple: 'Monday, Wednesday and Friday',
    repairOne: 'One day with nothing logged. The habits are as they were.',
    repairThree: '3 days with nothing logged. The habits are as they were.',
  },
  {
    locale: 'pt-BR',
    messages: ptBR,
    dates: 'quinta-feira, 1 de out. e sexta-feira, 2 de out.',
    pair: 'segunda e quarta',
    triple: 'segunda, quarta e sexta',
    repairOne: 'Um dia sem registro. Os hábitos continuam como estavam.',
    repairThree: '3 dias sem registro. Os hábitos continuam como estavam.',
  },
])('mobile Intl startup in $locale', ({ locale, messages, dates, pair, triple, repairOne, repairThree }) => {
  const icuCases = collectIcuMessages(messages).map(({ key, template }) => ({
    key,
    template,
    expected: [0, 1, 3, 1.5].map((count) => ({
      count,
      sentence: new IntlMessageFormat(template, locale).format(messageValues(count)),
    })),
  }))

  it('formats the repair card without native PluralRules', async () => {
    await i18n.changeLanguage(locale)
    expect(i18n.t('progressScreen.streak.gapBody', { count: 1 })).toBe(repairOne)
    expect(i18n.t('progressScreen.streak.gapBody', { count: 3 })).toBe(repairThree)
  })

  it.each(icuCases)('formats $key like native ICU without exposing its template', async ({ key, template, expected }) => {
    await i18n.changeLanguage(locale)
    for (const { count, sentence } of expected) {
      const rendered = i18n.t(key, messageValues(count))
      expect(rendered).toBe(sentence)
      expect(rendered).not.toBe(template)
      expect(rendered).not.toMatch(/[{}]/)
    }
  })

  it('formats repair dates without a native ListFormat', () => {
    expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], locale)).toBe(dates)
    expect(formatStreakRepairDates(['2026-10-01'], locale)).toBe(dates.split(locale === 'en' ? ' and ' : ' e ')[0])
    expect(formatStreakRepairDates([], locale)).toBe('')
  })

  it('formats two and three selected weekdays using the shipped translations', async () => {
    await i18n.changeLanguage(locale)
    const dayOptions = [
      { value: 'Monday', label: messages.dates.daysLong.monday },
      { value: 'Wednesday', label: messages.dates.daysLong.wednesday },
      { value: 'Friday', label: messages.dates.daysLong.friday },
    ]
    const translate = (key: string, values?: Record<string, string | number>) => i18n.t(key, values)
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
