import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildHabitUnderstandingSentence } from '../utils/habit-form-helpers'
import { formatWeekdaySchedule } from '../utils/weekday-schedule'

const weekdayCases = [
  ['Sunday', 'todo domingo', 'domingos', false],
  ['Monday', 'toda segunda', 'segundas', true],
  ['Tuesday', 'toda terça', 'terças', true],
  ['Wednesday', 'toda quarta', 'quartas', true],
  ['Thursday', 'toda quinta', 'quintas', true],
  ['Friday', 'toda sexta', 'sextas', true],
  ['Saturday', 'todo sábado', 'sábados', false],
] as const
const scheduleCases = [
  ...weekdayCases.map(([day, single]) => ({ days: [day], portuguese: single, english: `every ${day}`, weeks: 1 })),
  ...weekdayCases.flatMap(([first, , firstPlural, firstFeminine], index) =>
    weekdayCases.slice(index + 1).map(([second, , secondPlural, secondFeminine]) => ({
      days: [first, second],
      portuguese: `${firstFeminine ? 'às' : 'aos'} ${firstPlural} e ${firstFeminine === secondFeminine ? '' : secondFeminine ? 'às ' : 'aos '}${secondPlural}`,
      english: `every ${first} and ${second}`, weeks: 1,
    }))),
  { days: ['Monday', 'Thursday', 'Saturday'], portuguese: 'às segundas, quintas e aos sábados', english: 'every Monday, Thursday and Saturday', weeks: 1 },
  { days: ['Sunday'], portuguese: 'a cada 2 semanas, aos domingos', english: 'every 2 weeks on Sunday', weeks: 2 },
  { days: ['Monday'], portuguese: 'a cada 2 semanas, às segundas', english: 'every 2 weeks on Monday', weeks: 2 },
  { days: ['Friday', 'Saturday'], portuguese: 'a cada 2 semanas, às sextas e aos sábados', english: 'every 2 weeks on Friday and Saturday', weeks: 2 },
  { days: weekdayCases.map(([day]) => day), portuguese: 'a cada 2 semanas, aos domingos, às segundas, terças, quartas, quintas, sextas e aos sábados', english: 'every 2 weeks on Sunday, Monday, Tuesday, Wednesday, Thursday, Friday and Saturday', weeks: 2 },
]
const localizedScheduleCases = scheduleCases.flatMap((scheduleCase) =>
  (['en', 'pt-BR'] as const).flatMap((locale) => ['', '08:00'].map((time) => ({
    ...scheduleCase, locale, time,
    expected: `${locale === 'en' ? scheduleCase.english : scheduleCase.portuguese}${time ? `${locale === 'en' ? ' at ' : ' às '}${time}` : ''}`,
  }))))

function translator(messages: typeof en | typeof ptBR) {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = key.split('.').reduce<unknown>((current, part) => Reflect.get(current as object, part), messages) as string
    return Object.entries(values ?? {}).reduce((sentence, [name, value]) => sentence.replace(`{${name}}`, String(value)), template)
  }
}

describe('weekday schedule sentences', () => {
  it.each(localizedScheduleCases)('formats the habit summary $days in $locale at $time every $weeks weeks', ({ days, locale, time, weeks, expected }) => {
    const translate = translator(locale === 'en' ? en : ptBR)
    const options = weekdayCases.map(([value]) => ({ value, label: value }))
    const expectedSummary = locale === 'en' && weeks > 1
      ? `every ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(days)}${time ? ` at ${time}` : ''}, every ${weeks} weeks`
      : expected
    const sentence = buildHabitUnderstandingSentence(days, options, false, 'Day', 1, time, locale, translate, weeks)
    expect(sentence).not.toMatch(/toda (sábado|domingo)|todo (segunda|terça|quarta|quinta|sexta)/)
    expect(sentence).toBe(expectedSummary)
  })

  it.each(['en', 'pt-BR'])('formats an empty weekday list in %s', (locale) => {
    expect(formatWeekdaySchedule([], locale, translator(locale === 'en' ? en : ptBR))).toBe('')
  })

  it.each([
    ['en', en, '3 times a week, any day, every 2 weeks'],
    ['pt-BR', ptBR, '3 vezes por semana, qualquer dia, a cada 2 semanas'],
  ] as const)('templates non-weekday repeat summaries in %s', (locale, messages, expected) => {
    expect(buildHabitUnderstandingSentence([], [], true, 'Week', 3, '', locale, translator(messages), 2)).toBe(expected)
  })
})
