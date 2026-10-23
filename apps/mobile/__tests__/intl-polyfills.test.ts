import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { formatStreakRepairDates } from '@orbit/shared/utils/progress'
import { formatBlockAnswer } from '@orbit/shared/chat/block-answer'
import { formatWeekdaySchedule } from '@orbit/shared/utils/weekday-schedule'
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

type MessageValue = string | number | Date | ((parts: string[]) => string)
type MessageValues = Record<string, MessageValue>

function collectArgumentValues(
  elements: MessageFormatElement[], count: number, candidates: Record<string, MessageValue[]>,
) {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue
    if (element.type === TYPE.argument) {
      candidates[element.value] ??= ['Example']
    } else if (element.type === TYPE.number || element.type === TYPE.plural) {
      candidates[element.value] = [count]
    } else if (element.type === TYPE.date || element.type === TYPE.time) {
      candidates[element.value] = [new Date('2026-10-01T08:00:00Z')]
    } else if (element.type === TYPE.select) {
      candidates[element.value] = [...new Set([
        ...(candidates[element.value] ?? []), ...Object.keys(element.options),
      ])]
    } else {
      candidates[element.value] = [(parts: string[]) => parts.join('')]
      collectArgumentValues(element.children, count, candidates)
    }
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      for (const option of Object.values(element.options)) collectArgumentValues(option.value, count, candidates)
    }
  }
}

function messageValues(elements: MessageFormatElement[], count: number): MessageValues[] {
  const candidates: Record<string, MessageValue[]> = {}
  collectArgumentValues(elements, count, candidates)
  return Object.entries(candidates).reduce<MessageValues[]>((combinations, [name, values]) =>
    combinations.flatMap((combination) => values.map((value) => ({ ...combination, [name]: value }))), [{}])
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
    pair: 'às segundas e quartas',
    triple: 'às segundas, quartas e sextas',
    repairOne: 'Um dia sem registro. Os hábitos continuam como estavam.',
    repairThree: '3 dias sem registro. Os hábitos continuam como estavam.',
  },
])('mobile Intl startup in $locale', ({ locale, messages, dates, pair, triple, repairOne, repairThree }) => {
  const icuCases = collectIcuMessages(messages).map(({ key, template }) => {
    const elements = parse(template)
    return {
      key,
      template,
      expected: [0, 1, 3, 1.5].flatMap((count) => messageValues(elements, count).map((values) => ({
        values,
        sentence: new IntlMessageFormat(template, locale).format(values),
      }))),
    }
  })

  it('formats the repair card without native PluralRules', async () => {
    await i18n.changeLanguage(locale)
    expect(i18n.t('progressScreen.streak.gapBody', { count: 1 })).toBe(repairOne)
    expect(i18n.t('progressScreen.streak.gapBody', { count: 3 })).toBe(repairThree)
  })

  it.each(icuCases)('formats $key like native ICU without exposing its template', async ({ key, template, expected }) => {
    await i18n.changeLanguage(locale)
    for (const { values, sentence } of expected) {
      const rendered = i18n.t(key, values)
      expect(rendered).toBe(sentence)
      expect(rendered).not.toBe(template)
      expect(rendered).not.toMatch(/[{}]/)
    }
  })

  it('covers every nested select option with new argument names', () => {
    const template = '{selection, select, named {{detail, select, short {<em>{title}</em>} long {{amount, number}} other {Detail}}} empty {Empty} other {Fallback}}'
    const formatter = new IntlMessageFormat(template, locale)
    const sentences = messageValues(parse(template), 3).map((values) => formatter.format(values))
    expect(new Set(sentences)).toEqual(new Set(['Example', '3', 'Detail', 'Empty', 'Fallback']))
  })

  it('derives numeric, ordinal, date and time arguments by their ICU types', () => {
    const template = '{quantity, plural, other {#}} {position, selectordinal, other {#}} {amount, number} {appointment, date, short} {alarm, time, short}'
    const fixtureDate = new Date('2026-10-01T08:00:00Z')
    const date = new Intl.DateTimeFormat(locale, { year: '2-digit', month: 'numeric', day: 'numeric' }).format(fixtureDate)
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: 'numeric' }).format(fixtureDate)
    const formatter = new IntlMessageFormat(template, locale)
    expect(messageValues(parse(template), 3).map((values) => formatter.format(values)))
      .toEqual([`3 3 3 ${date} ${time}`])
  })

  it('formats repair dates without a native ListFormat', () => {
    expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], locale)).toBe(dates)
    expect(formatStreakRepairDates(['2026-10-01'], locale)).toBe(dates.split(locale === 'en' ? ' and ' : ' e ')[0])
    expect(formatStreakRepairDates([], locale)).toBe('')
  })

  it('formats repair dates when ListFormat is undefined at the call site', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'ListFormat')!
    Object.defineProperty(Intl, 'ListFormat', { configurable: true, writable: true, value: undefined })
    try {
      expect(formatStreakRepairDates(['2026-10-01', '2026-10-02'], locale)).toBe(dates)
      expect(formatStreakRepairDates([], locale)).toBe('')
      expect(formatStreakRepairDates(['2026-10-01'], locale)).toBe(dates.split(locale === 'en' ? ' and ' : ' e ')[0])
      expect(formatBlockAnswer(['Morning', 'Afternoon'], ' Evening ', locale))
        .toBe(locale === 'en' ? 'Morning, Afternoon, and Evening' : 'Morning, Afternoon e Evening')
      expect(formatWeekdaySchedule(['Monday', 'Wednesday', 'Friday'], locale, (key) => {
        const day = key.split('.').at(-1) as keyof typeof messages.dates.weekdaySchedule.list
        return messages.dates.weekdaySchedule.list[day]
      })).toBe(triple)
    } finally {
      Object.defineProperty(Intl, 'ListFormat', descriptor)
    }
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
