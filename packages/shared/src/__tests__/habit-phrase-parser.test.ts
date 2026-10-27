import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildOnboardingScheduleFromPhrase } from '../utils/onboarding'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'
import { readHabitRecurrencePhrase } from '../utils/habit-recurrence-phrase'
import { readDateWeekday } from '../utils/date-phrase-parser'
import { isWeeklyRecurrencePhrase, readHabitPhrase as parseHabitPhrase, readTypedHabitPhrase, segmentHabitPhrase } from '../utils/habit-phrase-parser'

function readHabitPhrase(...[input, locale]: Parameters<typeof parseHabitPhrase>) {
  const read = parseHabitPhrase(input, locale)
  let cursor = 0
  for (const token of read.consumed) {
    expect(token.start).toBeGreaterThanOrEqual(cursor)
    expect(token.end).toBeGreaterThan(token.start)
    expect(token.end).toBeLessThanOrEqual(input.length)
    cursor = token.end
  }
  expect(segmentHabitPhrase(input, read.consumed).map((segment) => segment.text).join('')).toBe(input)
  return read
}

interface PhraseCase {
  input: string
  locale: 'en' | 'pt-BR'
  cadence: 'daily' | 'fixed' | 'flexible' | null
  quantity?: number
  days?: string[]
  interval?: number
  time?: string
}

const cases: PhraseCase[] = [
  { input: 'Correr 12 vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 12 },
  { input: 'Correr 3 vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 3 },
  { input: 'correr 3 VEZES POR SEMANA', locale: 'pt-BR', cadence: 'flexible', quantity: 3 },
  { input: 'Ler 1 vez por semana', locale: 'pt-BR', cadence: 'flexible', quantity: 1 },
  { input: 'Caminhar uma vez por semana', locale: 'pt-BR', cadence: 'flexible', quantity: 1 },
  { input: 'Beber agua duas vezes na semana', locale: 'pt-BR', cadence: 'flexible', quantity: 2 },
  { input: 'Alongar 20x semana', locale: 'pt-BR', cadence: 'flexible', quantity: 20 },
  { input: 'Ler terca e quinta as 8h30', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Thursday'], time: '08:30' },
  { input: 'Correr térça e quínta', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Thursday'] },
  { input: 'LER SEGUNDA-FEIRA', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'] },
  { input: 'Meditar no domingo', locale: 'pt-BR', cadence: 'fixed', days: ['Sunday'] },
  { input: 'Correr sabado e domingo', locale: 'pt-BR', cadence: 'fixed', days: ['Saturday', 'Sunday'] },
  { input: 'Meditar todos os dias às 7', locale: 'pt-BR', cadence: 'daily', time: '07:00' },
  { input: 'alongar diariamente 21:15', locale: 'pt-BR', cadence: 'daily', time: '21:15' },
  { input: 'terça, quarta e quinta a cada 2 semanas', locale: 'pt-BR', cadence: 'fixed', days: ['Tuesday', 'Wednesday', 'Thursday'], interval: 2 },
  { input: '3 vezes por semana a cada 3 semanas', locale: 'pt-BR', cadence: 'flexible', quantity: 3, interval: 3 },
  { input: 'Run 12 times a week', locale: 'en', cadence: 'flexible', quantity: 12 },
  { input: 'RUN 3 TIMES A WEEK', locale: 'en', cadence: 'flexible', quantity: 3 },
  { input: 'Read once a week', locale: 'en', cadence: 'flexible', quantity: 1 },
  { input: 'Stretch twice per week', locale: 'en', cadence: 'flexible', quantity: 2 },
  { input: 'Journal 15x a week', locale: 'en', cadence: 'flexible', quantity: 15 },
  { input: 'Read tuesdays and thursdays at 8:30', locale: 'en', cadence: 'fixed', days: ['Tuesday', 'Thursday'], time: '08:30' },
  { input: 'walk sat and sun at 7pm', locale: 'en', cadence: 'fixed', days: ['Saturday', 'Sunday'], time: '19:00' },
  { input: 'Meditate every day at 7', locale: 'en', cadence: 'daily', time: '07:00' },
  { input: 'tuesday wednesday thursday every 2 weeks', locale: 'en', cadence: 'fixed', days: ['Tuesday', 'Wednesday', 'Thursday'], interval: 2 },
  { input: '3 times a week every 3 weeks', locale: 'en', cadence: 'flexible', quantity: 3, interval: 3 },
  { input: 'Beber água quando der', locale: 'pt-BR', cadence: null },
  { input: 'Drink coffee without sugar every Monday at 8', locale: 'en', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Ler sem celular na segunda às 8', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Do not smoke on Monday at 8', locale: 'en', cadence: 'fixed', days: ['Monday'], time: '08:00' },
  { input: 'Não fumar na segunda às 8', locale: 'pt-BR', cadence: 'fixed', days: ['Monday'], time: '08:00' },
]

it('preserves complete reads from the existing corpus across normalized variants', () => {
  const reads = cases.flatMap(({ input, locale }) => [
    input, input.toUpperCase(), input.toLowerCase(), input.normalize('NFD'),
    input.normalize('NFD').replace(/\p{M}/gu, ''), input.replaceAll(' ', '\t  '),
    `  ${input}  `, `🧘 ${input}`,
  ].map((variant) => ({ input: variant, locale, read: readHabitPhrase(variant, locale) })))
  expect(reads).toHaveLength(248)
  expect(createHash('sha256').update(JSON.stringify(reads)).digest('hex')).toMatchInlineSnapshot(`"9524ac25d0db40f726d9378f732d6fc46a521054606015725b39be6dd9244566"`)
})

describe('recurrence-only wording', () => {
  it.each(['toda semana', 'todas as semanas', 'semanalmente', 'every week', 'weekly'])('recognizes %s with safe casing, whitespace and punctuation', (phrase) => {
    for (const value of [phrase, `  ${phrase.toUpperCase().replaceAll(' ', '\t  ')}.  `, `! ${phrase} ?`]) {
      expect(isWeeklyRecurrencePhrase(value)).toBe(true)
      for (const locale of ['en', 'pt-BR'] as const) {
        const read = readHabitPhrase(value, locale)
        expect(read).toMatchObject({ cadence: null, dueTime: null, consumed: [] })
        expect(segmentHabitPhrase(value, read.consumed)).toEqual([{ text: value, consumed: false }])
      }
    }
  })

  it.each(['', 'week', 'biweekly', 'every 2 weeks', '3 times a week', 'every week tomorrow', 'tomorrow every week', 'toda semana segunda', 'toda semana às 8', 'weekly report', 'Read weekly', 'todas semanas', 'weekly\u200b', 'weekly '.repeat(1000)])('leaves unsupported or mixed wording unchanged: %s', (phrase) => {
    expect(isWeeklyRecurrencePhrase(phrase)).toBe(false)
  })
})

describe('readHabitPhrase', () => {
  it.each([
    { locale: 'en', invalid: 'at 1.5pm', valid: 'at 1pm', dueTime: '13:00' },
    { locale: 'en', invalid: 'at 13:30.5', valid: 'at 13:30', dueTime: '13:30' },
    { locale: 'en', invalid: '1.5pm', valid: '1pm', dueTime: '13:00' },
    { locale: 'en', invalid: '1.5:30', valid: '5:30', dueTime: '05:30' },
    { locale: 'en', invalid: '13:30.5', valid: '13:30', dueTime: '13:30' },
    { locale: 'en', invalid: '1.5h', valid: '5h', dueTime: '05:00' },
    { locale: 'en', invalid: '13h.5', valid: '13h', dueTime: '13:00' },
    { locale: 'en', invalid: '1pm.5', valid: '1pm', dueTime: '13:00' },
    { locale: 'pt-BR', invalid: 'às 1,5h', valid: 'às 13h', dueTime: '13:00' },
    { locale: 'pt-BR', invalid: 'às 13:30,5', valid: 'às 13:30', dueTime: '13:30' },
    { locale: 'pt-BR', invalid: '1,5h', valid: '5h', dueTime: '05:00' },
    { locale: 'pt-BR', invalid: '1,5:30', valid: '5:30', dueTime: '05:30' },
    { locale: 'pt-BR', invalid: '13:30,5', valid: '13:30', dueTime: '13:30' },
    { locale: 'pt-BR', invalid: '13h,5', valid: '13h', dueTime: '13:00' },
  ] as const)('keeps decimal clock $invalid unresolved and valid clock $valid intact', ({ locale, invalid, valid, dueTime }) => {
    for (const punctuation of ['', '.', ',']) {
      const input = `${valid}${punctuation}`
      const read = readHabitPhrase(input, locale)
      expect(read.dueTime).toBe(dueTime)
      expect(read.consumed).toEqual([{ start: 0, end: valid.length, kind: 'time' }])
    }
    for (const decimal of ['1.5 km', '1,5 km']) {
      expect(readHabitPhrase(decimal, locale)).toMatchObject({ dueTime: null, consumed: [] })
    }
    const read = readHabitPhrase(invalid, locale)
    expect(read).toMatchObject({ dueTime: null, consumed: [] })
    expect(segmentHabitPhrase(invalid, read.consumed)).toEqual([{ text: invalid, consumed: false }])
  })

  it.each([
    ['Read every day at 8h30', '08:30'],
    ['Read every day 08h30', '08:30'],
    ['Read every day at 8h', '08:00'],
    ['Read every day 21h', '21:00'],
  ])('consumes English h-clock forms: %s', (input, dueTime) => {
    for (const variant of [input.toUpperCase(), input.toLowerCase()]) {
      const read = readHabitPhrase(variant, 'en')
      expect(read).toMatchObject({ cadence: 'daily', dueTime })
      expect(read.consumed.filter((token) => token.kind === 'time')).toHaveLength(1)
    }
  })

  it.each([9, 12, 99, 999])('accepts a positive weekly count of %s in both locales', (quantity) => {
    expect(readHabitPhrase(`Run ${quantity} times a week`, 'en').frequencyQuantity).toBe(quantity)
    expect(readHabitPhrase(`Correr ${quantity} vezes na semana`, 'pt-BR').frequencyQuantity).toBe(quantity)
  })

  it.each(cases)('reads case and accent variants of $input', ({ input, locale, cadence, quantity, days, interval, time }) => {
    for (const variant of [input.toUpperCase(), input.toLowerCase(), input.normalize('NFD'), input.normalize('NFD').replace(/\p{M}/gu, '')]) {
      expect(readHabitPhrase(variant, locale)).toMatchObject({ cadence, frequencyQuantity: quantity ?? null, days: days ?? [], intervalWeeks: interval ?? null, dueTime: time ?? null })
    }
  })

  it.each(['Run 0 times a week', 'Run 000 times a week'])('leaves nonpositive counts unresolved: %s', (input) => {
    expect(readHabitPhrase(input, 'en')).toMatchObject({ cadence: null, frequencyQuantity: null, consumed: [] })
  })

  it.each(['at 8:99', 'at 8:3', 'at 13pm', 'at 0am', 'at 7:30:20'])('does not consume part of an invalid clock: %s', (input) => {
    expect(readHabitPhrase(input, 'en')).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each(['às 8:99', 'às 8:3', 'às 8h99', '21:15:30'])('does not consume part of an invalid Portuguese clock: %s', (input) => {
    expect(readHabitPhrase(input, 'pt-BR')).toMatchObject({ dueTime: null, consumed: [] })
  })

  it.each(['segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras'])('consumes the entire plural weekday: %s', (input) => {
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read.cadence).toBe('fixed')
    expect(segmentHabitPhrase(input, read.consumed)).toEqual([{ text: input, consumed: true }])
  })

  it('includes trailing decomposed accents in highlighted spans', () => {
    const input = 'LER SEGUNDA-FEIRÁ'.normalize('NFD')
    const segments = segmentHabitPhrase(input, readHabitPhrase(input, 'pt-BR').consumed)
    expect(segments).toEqual([{ text: 'LER ', consumed: false }, { text: 'SEGUNDA-FEIRÁ'.normalize('NFD'), consumed: true }])
  })

  it.each(cases)('reads $input', ({ input, locale, cadence, quantity, days, interval, time }) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({
      cadence,
      frequencyQuantity: quantity ?? null,
      days: days ?? [],
      intervalWeeks: interval ?? null,
      dueTime: time ?? null,
    })
  })

  it('gives weekdays precedence and leaves the count unconsumed', () => {
    const input = 'Correr terça e quinta 3 vezes na semana'
    const read = readHabitPhrase(input, 'pt-BR')
    expect(read).toMatchObject({ cadence: 'fixed', days: ['Tuesday', 'Thursday'], frequencyQuantity: null })
    expect(read.consumed.map((token) => token.kind)).toEqual(['weekday', 'weekday'])
    expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')).toContain('3 vezes na semana')
  })

  it('does not mistake the Portuguese verb ter for Tuesday', () => {
    expect(readHabitPhrase('Ter foco 3 vezes por semana', 'pt-BR')).toMatchObject({
      cadence: 'flexible',
      days: [],
      frequencyQuantity: 3,
    })
  })

  it('keeps original indices after accent removal and whitespace collapse', () => {
    const input = '  TERÇA,   QUINTA às 8h30  '
    const segments = segmentHabitPhrase(input, readHabitPhrase(input, 'pt-BR').consumed)
    expect(segments.map((segment) => segment.text).join('')).toBe(input)
    expect(segments.filter((segment) => segment.consumed).map((segment) => segment.text)).toEqual(['TERÇA', 'QUINTA', 'às 8h30'])
  })

  it('keeps UTF-16 token offsets exact after a supplementary character', () => {
    const input = '🏃 Run Monday at 8'
    const read = readHabitPhrase(input, 'en')
    expect(read.consumed).toEqual([
      { start: 7, end: 13, kind: 'weekday' },
      { start: 14, end: 18, kind: 'time' },
    ])
    expect(read.consumed.every((token) => Number.isFinite(token.start) && Number.isFinite(token.end))).toBe(true)
    const segments = segmentHabitPhrase(input, read.consumed)
    expect(segments.map((segment) => segment.text).join('')).toBe(input)
    expect(segments.filter((segment) => segment.consumed).map((segment) => segment.text)).toEqual(['Monday', 'at 8'])
  })

  it('does not treat a weekly count as a clock time', () => {
    expect(readHabitPhrase('Run 3 times a week', 'en').dueTime).toBeNull()
  })

  it('does not claim a cadence from an activity name alone', () => {
    expect(readHabitPhrase('Correr', 'pt-BR')).toMatchObject({
      cadence: null,
      days: [],
      frequencyQuantity: null,
      intervalWeeks: null,
      dueTime: null,
      consumed: [],
    })
  })

  it('leaves invalid clock times unresolved', () => {
    expect(readHabitPhrase('Drink water at 27:80', 'en')).toMatchObject({ cadence: null, dueTime: null, consumed: [] })
  })

  it('leaves a repeat interval above the API maximum unconsumed', () => {
    const input = 'Run Tuesday every 53 weeks'
    const read = readHabitPhrase(input, 'en')
    expect(read).toMatchObject({ cadence: 'fixed', intervalWeeks: null })
    expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')).toContain('every 53 weeks')
  })
})

const everyDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('weekday negation', () => {
  it.each([
    ['en', 'Read every day except for Sunday'],
    ['en', 'Read not this Sunday'],
    ['en', 'Read but not next Saturday'],
    ['pt-BR', 'Ler todo dia exceto no próximo domingo'],
    ['pt-BR', 'Ler não no próximo domingo'],
    ['pt-BR', 'Ler menos neste sábado'],
  ] as const)('leaves qualified weekday negation unresolved across consumers: %s %s', (locale, input) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: null, days: [], intervalWeeks: null, consumed: [] })
    expect(segmentHabitPhrase(input, read.consumed)).toEqual([{ text: input, consumed: false }])
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true })
    expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: null, days: [], consumed: [] })
    expect(getHabitPhraseTitle(input, locale)).toBe(input)
    expect(readHabitRecurrencePhrase(input)).toBeNull()
    expect(readDateWeekday(input)).toBeNull()
  })

  it.each([
    { locale: 'en', activity: 'Read', negations: ['except', 'except for', 'but not', 'not', 'never', 'excluding', 'without', "don't", 'cannot'], weekdays: ['for Sunday', 'this Sunday', 'next Sunday', 'on this Sunday', 'on the next Sunday', 'in the coming Sundays', 'on the following Tuesdays'], clock: 'at 8' },
    { locale: 'pt-BR', activity: 'Ler', negations: ['menos', 'exceto', 'sem ser', 'não', 'nunca', 'tirando', 'salvo', 'sem'], weekdays: ['o próximo domingo', 'no próximo domingo', 'neste domingo', 'nesse domingo', 'em um próximo domingo', 'nas próximas terças-feiras'], clock: 'às 8' },
  ] as const)('retains qualified negated weekdays and an independent clock in $locale', ({ locale, activity, negations, weekdays, clock }) => {
    for (const negation of negations) {
      for (const weekday of weekdays) {
        const phrase = `${activity} ${negation} ${weekday} ${clock}`
        for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
          const read = readHabitPhrase(input, locale)
          expect(read, input).toMatchObject({ cadence: null, days: [], intervalWeeks: null, dueTime: '08:00' })
          expect(read.consumed.map((token) => token.kind), input).toEqual(['time'])
          const unread = segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('')
          expect(unread.toLowerCase().normalize('NFD').replace(/\s+/gu, ' '), input).toContain(weekday.toLowerCase().normalize('NFD'))
          expect(buildOnboardingScheduleFromPhrase(input, locale), input).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true, dueTime: '08:00' })
        }
      }
    }
  })

  it.each([
    ['en', 'Meditate every day except Sunday at 8 and Saturday'],
    ['pt-BR', 'Meditar todo dia menos domingo às 8 e sábado'],
  ] as const)('keeps clock and exclusion spans disjoint: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 5), dueTime: '08:00' })
  })

  it.each([
    ['en', 'Read not on Monday at 8'],
    ['pt-BR', 'Ler não na segunda às 8'],
  ] as const)('preserves an independent clock when the weekday is unresolved: %s %s', (locale, input) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: null, days: [], dueTime: '08:00' })
    expect(read.consumed.map((token) => token.kind)).toEqual(['time'])
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], isGeneral: true, dueTime: '08:00' })
    expect(readTypedHabitPhrase(input, locale, 'task', false)).toMatchObject({ cadence: null, days: [], dueTime: '08:00', consumed: read.consumed })
    expect(getHabitPhraseTitle(input, locale, { cadence: false, dueTime: false })).toBe(input)
  })

  it.each([
    ['en', 'Meditate without a phone every day except Sunday at 8'],
    ['pt-BR', 'Meditar sem celular todo dia menos domingo às 8'],
  ] as const)('keeps activity negation separate from an exclusion: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 6), dueTime: '08:00' })
  })

  it('keeps token spans sorted and disjoint and round-trips clock placements and normalized variants', () => {
    for (const [locale, activity, schedule, clocks, separator, lastDay] of [
      ['en', '🧘 Meditate', 'every day except Sunday', ['at 8', '08:30', '7pm'], 'and', 'Saturday'],
      ['pt-BR', '🧘 Meditar', 'todo dia menos domingo', ['às 8', '08:30', '21h'], 'e', 'sábado'],
    ] as const) {
      for (const clock of clocks) {
        for (const input of [
          `${activity} ${clock} ${schedule} ${separator} ${lastDay}`,
          `${activity} ${schedule} ${clock} ${separator} ${lastDay}`,
          `${activity} ${schedule} ${separator} ${clock} ${lastDay}`,
          `${activity} ${schedule} ${separator} ${lastDay} ${clock}`,
        ]) {
          for (const variant of [input, input.toUpperCase(), input.normalize('NFD'), input.replaceAll(' ', '\t  ')]) {
            expect(readHabitPhrase(variant, locale).cadence).toBe('fixed')
          }
        }
      }
    }
  })

  it.each([
    ['en', 'every day except Sunday', ['Sunday']],
    ['en', 'every day except Sundays', ['Sunday']],
    ['en', 'every day but not on Saturday', ['Saturday']],
    ['en', 'every day except Saturdays and Sundays', ['Saturday', 'Sunday']],
    ['en', 'except Sundays', ['Sunday']],
    ['en', 'but not on Saturday', ['Saturday']],
    ['pt-BR', 'todo dia menos domingo', ['Sunday']],
    ['pt-BR', 'todos os dias menos aos domingos', ['Sunday']],
    ['pt-BR', 'todo dia exceto sábado', ['Saturday']],
    ['pt-BR', 'todo dia sem ser domingo', ['Sunday']],
    ['pt-BR', 'todos os dias exceto sábados e domingos', ['Saturday', 'Sunday']],
    ['pt-BR', 'exceto sábado', ['Saturday']],
    ['pt-BR', 'sem ser domingo', ['Sunday']],
    ['pt-BR', 'menos às terças-feiras', ['Tuesday']],
  ] as const)('excludes weekdays across schedule readers: %s %s', (locale, phrase, excluded) => {
    const days = everyDay.filter((day) => !excluded.some((excludedDay) => excludedDay === day))
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: 'fixed', days })
      expect(segmentHabitPhrase(input, read.consumed).filter((segment) => !segment.consumed).map((segment) => segment.text).join('').trim()).toBe('')
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days, isGeneral: false })
      expect(readHabitRecurrencePhrase(input)).toMatchObject({ schedule: { days, unit: 'Day' } })
      expect(readDateWeekday(input)).toBeNull()
    }
  })

  it.each([
    ['pt-BR', 'Meditar dez minutos depois do café, menos aos domingos'],
    ['pt-BR', 'Meditar todo dia menos domingo quando chover'],
    ['pt-BR', 'Correr três vezes por semana, exceto sábado'],
    ['pt-BR', 'segunda mas não domingo'],
    ['pt-BR', 'não aos domingos'],
    ['en', 'Run every other day except Sunday'],
    ['en', 'Run every day except Sunday when it rains'],
    ['en', 'Monday but not on Saturday'],
    ['en', 'not on Sundays'],
    ['en', 'no Sundays'],
    ['en', 'Do not run every day except Sunday'],
    ['pt-BR', 'Não meditar todo dia menos domingo'],
    ['en', 'weekends except Sundays'],
    ['en', 'every day except Sunday or Monday'],
    ['en', 'every day except Monday, Tuesday, Wednesday, Thursday, Friday, Saturday and Sunday'],
  ] as const)('leaves uncertain scope intact: %s %s', (locale, input) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: null, days: [], intervalWeeks: null, consumed: [] })
    expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], isGeneral: true })
    expect(readTypedHabitPhrase(input, locale, 'habit', false)).toMatchObject({ cadence: null, days: [], consumed: [] })
    expect(getHabitPhraseTitle(input, locale)).toBe(input)
    expect(readHabitRecurrencePhrase(input)).toBeNull()
    expect(readDateWeekday(input)).toBeNull()
  })

  it.each([
    ['pt-BR', 'Meditar todo dia menos aos domingos às 8h', 'Meditar'],
    ['en', 'Meditate every day except Sundays at 8', 'Meditate'],
  ] as const)('consumes the complete exclusion without leaving negation in the title: %s', (locale, input, title) => {
    expect(readHabitPhrase(input, locale)).toMatchObject({ cadence: 'fixed', days: everyDay.slice(0, 6), dueTime: '08:00' })
    expect(getHabitPhraseTitle(input, locale)).toBe(title)
  })
})


describe('weekday qualifiers', () => {
  const unresolved: Array<[PhraseCase['locale'], string]> = [
    ['pt-BR', 'Ligar para minha mãe no primeiro domingo de cada mês'],
    ['en', 'Call mom on the first Sunday of every month'],
    ['pt-BR', 'Ir à feira no segundo sábado do mês'],
    ['en', 'Call grandma on the last Sunday of the month'],
    ['en', 'Read next Monday'],
    ['en', 'Read every third Friday'],
    ['en', 'Read alternate Fridays'],
    ['en', 'Read Friday monthly'],
    ['en', 'Read Friday of every month'],
    ['en', 'Read Friday every month'],
    ['en', 'Read Friday in odd weeks'],
    ['pt-BR', 'Ler na próxima segunda'],
    ['pt-BR', 'Ler nas sextas alternadas'],
    ['pt-BR', 'Ler sexta mensalmente'],
    ['pt-BR', 'Ler sexta de cada mês'],
    ['pt-BR', 'Ler sexta em semanas pares'],
    ['pt-BR', 'Ler sexta sim, sábado não'],
    ['en', 'Read every other Friday every 3 weeks'],
    ['pt-BR', 'Ler sexta sim, sexta não a cada 3 semanas'],
  ]

  it.each(unresolved)('retains unsupported weekday qualifiers across consumers: %s %s', (locale, phrase) => {
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: null, days: [], frequencyQuantity: null, intervalWeeks: null, consumed: [] })
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toMatchObject({ days: [], frequencyUnit: null, isGeneral: true })
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      expect(getHabitPhraseTitle(input, locale)).toBe(input)
    }
  })

  it.each([
    { locale: 'en', ordinals: ['first', 'second', 'third', 'fourth', 'last', 'fifth', '1st'], endings: ['of the month', 'of every month', 'each month'] },
    { locale: 'pt-BR', ordinals: ['primeiro', 'segundo', 'terceiro', 'quarto', 'último', 'quinto', '1º'], endings: ['de cada mês', 'do mês'] },
  ] as const)('leaves monthly ordinals unresolved and preserves an independent clock in $locale', ({ locale, ordinals, endings }) => {
    const weekday = locale === 'en' ? 'Sunday' : 'domingo'
    const clock = locale === 'en' ? 'at 8' : 'às 8'
    for (const ordinal of ordinals) {
      for (const ending of endings) {
        const input = `🧘 ${ordinal} ${weekday} ${ending} ${clock}`
        const read = readHabitPhrase(input, locale)
        expect(read).toMatchObject({ cadence: null, days: [], intervalWeeks: null, dueTime: '08:00' })
        expect(read.consumed.map((token) => token.kind)).toEqual(['time'])
      }
    }
  })

  it.each([
    ['en', 'Review finances every other Friday', 'Friday', 'Review finances'],
    ['pt-BR', 'Revisar as finanças sexta sim, sexta não', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Revisar as finanças semana sim, semana não na sexta', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Revisar as finanças na sexta semana sim, semana não', 'Friday', 'Revisar as finanças'],
    ['pt-BR', 'Ler segunda-feira sim, segunda-feira não', 'Monday', 'Ler'],
    ['pt-BR', 'Ler terça sim terça não', 'Tuesday', 'Ler'],
    ['en', 'Read every other Sunday', 'Sunday', 'Read'],
  ] as const)('reads alternating weekdays as every two weeks: %s %s', (locale, phrase, day, title) => {
    const equivalent = locale === 'en' ? `every 2 weeks on ${day}` : `a cada duas semanas na ${phrase.includes('sexta') ? 'sexta' : day === 'Monday' ? 'segunda' : 'terça'}`
    for (const input of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), phrase.replaceAll(' ', '\t  ')]) {
      const read = readHabitPhrase(input, locale)
      expect(read).toMatchObject({ cadence: 'fixed', days: [day], intervalWeeks: 2, frequencyQuantity: null })
      expect(buildOnboardingScheduleFromPhrase(input, locale)).toEqual(buildOnboardingScheduleFromPhrase(equivalent, locale))
      expect(readTypedHabitPhrase(input, locale, 'habit', false)).toEqual(read)
      expect(getHabitPhraseTitle(input, locale).toLowerCase().normalize('NFC')).toBe(title.toLowerCase())
      expect(read.consumed.some((token) => token.kind === 'interval')).toBe(true)
    }
  })

  it('keeps adjacent Portuguese weekday names as weekly lists', () => {
    const weekdays = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
    for (const first of weekdays) {
      for (const second of weekdays) {
        const expected = [...new Set([
          ...readHabitPhrase(first, 'pt-BR').days, ...readHabitPhrase(second, 'pt-BR').days,
        ])]
        expect(readHabitPhrase(`Ler ${first} ${second}`, 'pt-BR')).toMatchObject({ cadence: 'fixed', days: expected, intervalWeeks: null })
      }
    }
  })

  it.each([
    ['en', '🧘 Read every other Friday at 8', 'Friday'],
    ['pt-BR', '🧘 Ler sexta sim, sexta não às 8', 'Friday'],
    ['pt-BR', '🧘 Ler semana sim, semana não na terça às 8', 'Tuesday'],
  ] as const)('keeps alternating cadence and clock tokens disjoint: %s %s', (locale, input, day) => {
    const read = readHabitPhrase(input, locale)
    expect(read).toMatchObject({ cadence: 'fixed', days: [day], intervalWeeks: 2, dueTime: '08:00' })
    expect(read.consumed.map((token) => token.kind).sort((left, right) => left.localeCompare(right))).toEqual(['interval', 'time', 'weekday'])
  })
})
