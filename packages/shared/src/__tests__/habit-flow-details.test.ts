import { describe, expect, it } from 'vitest'
import { guardHabitReadPatch, habitFlowFieldStep, habitFlowOptionalQuestions, readHabitWhenWords, summaryValueStep } from '../utils/habit-flow-details'

const base = { mode: 'create' as const, isGeneral: false, canSplit: true, hasParent: false, canEnd: true }
const context = { referenceDate: '2026-11-13', locale: 'pt-BR', timeZone: 'UTC', language: 'pt-BR' as const, allowPast: false }

describe('habitFlowOptionalQuestions', () => {
  it('gives every field of the full form a row on a dated create', () => {
    expect(habitFlowOptionalQuestions(base)).toEqual(['description', 'checklist', 'subHabits', 'avoid', 'tags', 'goals', 'endDate'])
  })

  it('hides the avoidance row for an undated item and the split row for a sub-item', () => {
    expect(habitFlowOptionalQuestions({ ...base, isGeneral: true, canSplit: false, canEnd: false })).toEqual(['description', 'checklist', 'tags', 'goals'])
  })

  it('adds the parent row in edit only', () => {
    expect(habitFlowOptionalQuestions({ ...base, mode: 'edit', canSplit: false, hasParent: true })).toContain('parent')
    expect(habitFlowOptionalQuestions({ ...base, hasParent: true })).not.toContain('parent')
  })
})

describe('summaryValueStep', () => {
  it('opens the repeat step for a dated habit and the date question for a task', () => {
    expect(summaryValueStep('when', { itemType: 'habit', isGeneral: false })).toBe('repeat')
    expect(summaryValueStep('when', { itemType: 'task', isGeneral: false })).toBe('when')
    expect(summaryValueStep('when', { itemType: 'habit', isGeneral: true })).toBe('when')
  })

  it('opens the reminder kinds from the reminder value and the time question from the time value', () => {
    expect(summaryValueStep('reminder', { itemType: 'task', isGeneral: false })).toBe('reminderKind')
    expect(summaryValueStep('time', { itemType: 'task', isGeneral: false })).toBe('time')
  })
})

describe('readHabitWhenWords', () => {
  it('reads a repeat before a date', () => {
    expect(readHabitWhenWords('toda segunda', context).kind).toBe('repeat')
  })

  it('resolves a day in the words of the person', () => {
    expect(readHabitWhenWords('dia 20', context)).toEqual({ kind: 'date', date: '2026-11-20' })
  })

  it('refuses a past day for a new task and keeps it for an edit', () => {
    expect(readHabitWhenWords('2026-11-01', context)).toEqual({ kind: 'past' })
    expect(readHabitWhenWords('2026-11-01', { ...context, allowPast: true })).toEqual({ kind: 'date', date: '2026-11-01' })
  })

  it('keeps words it cannot read unresolved', () => {
    expect(readHabitWhenWords('quando der vontade', context)).toEqual({ kind: 'unresolved' })
  })
})

describe('habitFlowFieldStep', () => {
  it('opens the step that owns a server field error', () => {
    expect(habitFlowFieldStep('title')).toBe('what')
    expect(habitFlowFieldStep('description')).toBe('optional:description')
    expect(habitFlowFieldStep('dueEndTime')).toBe('duration')
    expect(habitFlowFieldStep('slipAlertEnabled')).toBe('slipAlert')
  })

  it('stays on the summary for an unknown field', () => {
    expect(habitFlowFieldStep('somethingElse')).toBe('summary')
    expect(habitFlowFieldStep(undefined)).toBe('summary')
  })
})

describe('guardHabitReadPatch', () => {
  const patch = { mode: 'recurring' as const, emoji: '💊', frequencyUnit: 'Day' as const, frequencyQuantity: 1, days: ['Monday'], dueTime: '08:00', subHabitTitles: [], checklistItems: [] }

  it('keeps every proposal when the person chose nothing yet', () => {
    expect(guardHabitReadPatch(patch, { deliberateType: null, timeAnswered: false })).toEqual(patch)
  })

  it('keeps a deliberate task with no repeat and a time the person answered', () => {
    expect(guardHabitReadPatch(patch, { deliberateType: 'task', timeAnswered: true })).toEqual({
      ...patch, mode: 'oneTime', frequencyUnit: null, frequencyQuantity: null, days: [], dueTime: null,
    })
  })
})
