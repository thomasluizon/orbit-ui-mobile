import { describe, expect, it } from 'vitest'
import {
  describeHabitResult,
  optimisticHabitResult,
  phraseLeavesWordsUnread,
  readPhraseCoverage,
  remainingHabitFlowSteps,
  resetCoveredAnswers,
  resolveResultDestination,
} from '../utils/habit-flow'
import { readHabitPhrase } from '../utils/habit-phrase-parser'
import { habitPhraseReadSchema, PostApiHabitsReadPhraseResponseShape } from './habit-flow-fixtures'

const NO_ANSWERS = { when: false, time: false }

function steps(overrides: Partial<Parameters<typeof remainingHabitFlowSteps>[0]> = {}) {
  return remainingHabitFlowSteps({
    mode: 'create',
    hasDateOrRepeat: false,
    hasTime: false,
    phraseGaveTime: false,
    whenLocked: false,
    answers: NO_ANSWERS,
    ...overrides,
  })
}

describe('remainingHabitFlowSteps', () => {
  it('asks every question when the phrase gave nothing', () => {
    expect(steps()).toEqual(['what', 'when', 'time', 'summary'])
  })

  it('reaches phrase, reminder and summary for a phrase with a repeat and a time', () => {
    const read = readHabitPhrase('tomar remédio todo dia às 8', 'pt-BR')
    const coverage = readPhraseCoverage(read, false)
    expect(steps({
      hasDateOrRepeat: coverage.coversDateOrRepeat,
      phraseGaveTime: coverage.coversTime,
      hasTime: read.dueTime !== null,
    })).toEqual(['what', 'reminder', 'summary'])
  })

  it('shows the reminder step only when a time exists', () => {
    expect(steps({ answers: { when: true, time: true }, hasTime: false })).toEqual(['what', 'summary'])
    expect(steps({ answers: { when: true, time: true }, hasTime: true })).toEqual(['what', 'reminder', 'summary'])
  })

  it('skips the date question under a General parent', () => {
    expect(steps({ whenLocked: true })).toEqual(['what', 'summary'])
  })

  it('opens edit on the summary alone', () => {
    expect(steps({ mode: 'edit' })).toEqual(['summary'])
  })
})

describe('resetCoveredAnswers', () => {
  it('resets only the answers that the new phrase covers', () => {
    const read = readHabitPhrase('academia todo dia', 'pt-BR')
    const coverage = readPhraseCoverage(read, false)
    expect(resetCoveredAnswers({ when: true, time: true }, coverage)).toEqual({ when: false, time: true })
  })

  it('keeps every answer when the new phrase covers nothing', () => {
    const coverage = readPhraseCoverage(readHabitPhrase('academia', 'pt-BR'), false)
    expect(resetCoveredAnswers({ when: true, time: true }, coverage)).toEqual({ when: true, time: true })
  })
})

describe('phraseLeavesWordsUnread', () => {
  it('is false for an empty phrase and for a fully read phrase', () => {
    expect(phraseLeavesWordsUnread('  ', readHabitPhrase('', 'pt-BR'), false)).toBe(false)
    const phrase = 'tomar remédio todo dia às 8'
    expect(phraseLeavesWordsUnread(phrase, readHabitPhrase(phrase, 'pt-BR'), false)).toBe(false)
  })

  it('is true when the cadence or the time is left unread', () => {
    expect(phraseLeavesWordsUnread('academia', readHabitPhrase('academia', 'pt-BR'), false)).toBe(true)
  })
})

describe('describeHabitResult', () => {
  const task = { itemType: 'task', isGeneral: false, dueDate: '2026-11-14', dueTime: null, frequencyUnit: null, frequencyQuantity: null } as const

  it('picks one full sentence for each saved case', () => {
    expect(describeHabitResult(task, 'created').key).toBe('result.task.dated')
    expect(describeHabitResult({ ...task, dueTime: '08:00' }, 'created').key).toBe('result.task.datedTimed')
    expect(describeHabitResult({ ...task, dueDate: null }, 'created').key).toBe('result.task.undated')
    expect(describeHabitResult({ ...task, isGeneral: true }, 'created').key).toBe('result.task.undated')
    const habit = { ...task, itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 2 } as const
    expect(describeHabitResult(habit, 'created')).toMatchObject({ key: 'result.habit.repeat', cadence: { key: 'result.cadence.week', count: 2 } })
    expect(describeHabitResult({ ...habit, dueTime: '20:00' }, 'created').key).toBe('result.habit.repeatTimed')
    expect(describeHabitResult(habit, 'updated').key).toBe('result.habit.updated')
  })

  it('names the place: Today for a due or undated item, Calendar for a later one', () => {
    expect(resolveResultDestination({ dueDate: '2026-11-13', isGeneral: false }, '2026-11-13')).toBe('today')
    expect(resolveResultDestination({ dueDate: '2026-11-20', isGeneral: false }, '2026-11-13')).toBe('calendar')
    expect(resolveResultDestination({ dueDate: null, isGeneral: true }, '2026-11-13')).toBe('today')
  })
})

describe('habitPhraseReadSchema', () => {
  it('parses the shape of the generated read-phrase response', () => {
    const response = PostApiHabitsReadPhraseResponseShape
    expect(habitPhraseReadSchema.parse(response)).toEqual(response)
  })

  it('parses a miss with empty fields', () => {
    const miss = { read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }
    expect(habitPhraseReadSchema.parse(miss).read).toBe(false)
  })
})

describe('optimisticHabitResult', () => {
  it('names the facts of a draft so a queued create states what it saved', () => {
    expect(optimisticHabitResult({ itemType: 'habit', isGeneral: false, dueDate: '2026-11-14', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 }))
      .toEqual({ itemType: 'habit', isGeneral: false, dueDate: '2026-11-14', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
  })

  it('reads an empty date and an empty time as none, and an undecided type as a task', () => {
    expect(optimisticHabitResult({ itemType: null, isGeneral: true, dueDate: '', dueTime: '' }))
      .toEqual({ itemType: 'task', isGeneral: true, dueDate: null, dueTime: null, frequencyUnit: null, frequencyQuantity: null })
  })
})
