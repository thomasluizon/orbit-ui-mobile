import { describe, expect, it } from 'vitest'
import { readHabitPhrase, segmentHabitPhrase } from '../utils/habit-phrase-parser'

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
]

describe('readHabitPhrase', () => {
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
