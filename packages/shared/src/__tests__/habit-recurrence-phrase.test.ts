import { describe, expect, it } from 'vitest'
import { readHabitRecurrencePhrase } from '../utils/habit-recurrence-phrase'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const cases = [
  ['every day', 'Day', 1, false, []], ['daily', 'Day', 1, false, []],
  ['once a week', 'Week', 1, true, []], ['twice a week', 'Week', 2, true, []],
  ['3x a week', 'Week', 3, true, []], ['every Monday', 'Day', 1, false, ['Monday']],
  ['weekdays', 'Day', 1, false, weekdays], ['todo dia', 'Day', 1, false, []],
  ['todos os dias', 'Day', 1, false, []], ['uma vez por semana', 'Week', 1, true, []],
  ['duas vezes por semana', 'Week', 2, true, []], ['3x por semana', 'Week', 3, true, []],
  ['toda segunda', 'Day', 1, false, ['Monday']], ['dias úteis', 'Day', 1, false, weekdays],
  ['each day', 'Day', 1, false, []], ['diariamente', 'Day', 1, false, []],
  ['three times per week', 'Week', 3, true, []], ['três vezes na semana', 'Week', 3, true, []],
  ['every Monday and Thursday', 'Day', 1, false, ['Monday', 'Thursday']],
  ['todas as segundas-feiras e quintas-feiras', 'Day', 1, false, ['Monday', 'Thursday']],
  ['every two weeks', 'Week', 2, false, []], ['a cada duas semanas', 'Week', 2, false, []],
  ['each week', 'Week', 1, false, []], ['cada semana', 'Week', 1, false, []],
  ['weekly', 'Week', 1, false, []], ['semanalmente', 'Week', 1, false, []],
] as const

describe('When recurrence parsing', () => {
  it.each(cases)('reads the complete recurrence %s', (phrase, unit, quantity, flexible, days) => {
    for (const input of [phrase, ` ! ${phrase.toUpperCase().replaceAll(' ', '\t ')}. `]) {
      expect(readHabitRecurrencePhrase(input)).toEqual({ schedule: { unit, quantity, flexible, days, intervalWeeks: 1 }, startPhrase: null })
    }
  })

  it.each(['every Monday from next week', 'every Monday starting next week'])('separates the start anchor in %s', (phrase) => {
    expect(readHabitRecurrencePhrase(phrase)).toMatchObject({ schedule: { days: ['Monday'] }, startPhrase: 'next week' })
  })

  it('retains weekday intervals', () => {
    expect(readHabitRecurrencePhrase('toda segunda a cada 2 semanas')).toMatchObject({ schedule: { days: ['Monday'], intervalWeeks: 2 } })
  })

  it.each(['', 'after vacation', 'tomorrow', 'dia 23', '2026-10-23', 'weekly report', 'Read every Monday', 'not daily', 'once a week maybe', '0x a week', '-3x a week', '1.5x a week', 'daily at 8', 'toda segunda às 8', 'once a week every Monday'])('leaves unknown or date-only text unresolved: %s', (phrase) => {
    expect(readHabitRecurrencePhrase(phrase)).toBeNull()
  })
})
