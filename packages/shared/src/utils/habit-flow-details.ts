import { parseDatePhrase, type DatePhraseContext } from './date-phrase-parser'
import { readTypedHabitPhrase, type HabitPhraseRead } from './habit-phrase-parser'
import type { SupportedLocale } from '../types/profile'
import type { HabitFlowDetailStep, HabitFlowOptionalId } from './habit-flow-navigation'
import type { HabitFlowStepId } from './habit-flow'

export interface HabitFlowOptionalInput {
  mode: 'create' | 'edit'
  /** The item has no date, so it lives in General. An undated item has no avoidance settings. */
  isGeneral: boolean
  /** The flow can add sub-items: a create that is not itself a sub-item. */
  canSplit: boolean
  /** The flow has the parent picker: an edit. */
  hasParent: boolean
  /** The schedule allows an end date. */
  canEnd: boolean
}

/** The rows of the optional list, in the order the full form shows them. Every field of the full form has a row. */
export function habitFlowOptionalQuestions(input: HabitFlowOptionalInput): HabitFlowOptionalId[] {
  const rows: HabitFlowOptionalId[] = ['description', 'checklist']
  if (input.canSplit) rows.push('subHabits')
  if (!input.isGeneral) rows.push('avoid')
  if (input.mode === 'edit' && input.hasParent) rows.push('parent')
  rows.push('tags', 'goals')
  if (input.canEnd) rows.push('endDate')
  return rows
}

/** The step that a summary value opens. A habit's Quando opens its repeat; a task opens the date question. */
export function summaryValueStep(value: 'when' | 'time' | 'reminder', item: { itemType: 'task' | 'habit' | null | undefined; isGeneral: boolean }): HabitFlowStepId | HabitFlowDetailStep {
  if (value === 'when') return item.itemType === 'habit' && !item.isGeneral ? 'repeat' : 'when'
  if (value === 'reminder') return 'reminderKind'
  return 'time'
}

export type HabitWhenWords =
  | { kind: 'repeat'; read: HabitPhraseRead }
  | { kind: 'date'; date: string }
  | { kind: 'past' }
  | { kind: 'unresolved' }

export interface HabitWhenWordsContext extends DatePhraseContext {
  language: SupportedLocale
  /** A new task never takes a past day. An edit keeps a past day it already holds. */
  allowPast: boolean
}

/**
 * The person's own words on the date question. The device reads a repeat first, then a date. A day
 * before today is refused for a new task, so the step stays open with one line of guidance.
 */
export function readHabitWhenWords(text: string, context: HabitWhenWordsContext): HabitWhenWords {
  const read = readTypedHabitPhrase(text, context.language, null, false)
  if (read.cadence !== null) return { kind: 'repeat', read }
  const result = parseDatePhrase(text, context)
  if (result.status !== 'resolved') return { kind: 'unresolved' }
  if (!context.allowPast && result.date < context.referenceDate) return { kind: 'past' }
  return { kind: 'date', date: result.date }
}

const FIELD_STEPS: Readonly<Record<string, HabitFlowStepId | HabitFlowDetailStep>> = {
  title: 'what',
  dueDate: 'when',
  datePhrase: 'when',
  dueTime: 'time',
  dueEndTime: 'duration',
  frequencyUnit: 'repeat',
  frequencyQuantity: 'repeat',
  days: 'repeat',
  monthDays: 'repeat',
  intervalWeeks: 'repeat',
  reminderTimes: 'reminderKind',
  scheduledReminders: 'reminderKind',
  repeatReminder: 'reminderKind',
  description: 'optional:description',
  checklistItems: 'optional:checklist',
  subHabits: 'optional:subHabits',
  isBadHabit: 'optional:avoid',
  slipAlertEnabled: 'slipAlert',
  tagIds: 'optional:tags',
  goalIds: 'optional:goals',
  endDate: 'optional:endDate',
  parentId: 'optional:parent',
  emoji: 'summary',
}

/** A field error from the server opens the step that owns the field. An unknown field stays on the summary. */
export function habitFlowFieldStep(field: string | null | undefined): HabitFlowStepId | HabitFlowDetailStep {
  if (!field) return 'summary'
  return FIELD_STEPS[field] ?? 'summary'
}
