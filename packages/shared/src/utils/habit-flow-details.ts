import { formatConjunctionList } from './conjunction-list'
import { parseDatePhrase, type DatePhraseContext } from './date-phrase-parser'
import { getFriendlyErrorMessage } from './error-utils'
import { readTypedHabitPhrase, type HabitPhraseRead } from './habit-phrase-parser'
import type { SupportedLocale } from '../types/profile'
import type { HabitFlowDetailStep, HabitFlowOptionalId } from './habit-flow-navigation'
import type { HabitFlowStepId } from './habit-flow'
import type { HabitFormSuggestionPatch } from './habit-form-helpers'

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

/** The answers of the optional list that the form state does not hold. The owner of each value passes it to the flow. */
export interface HabitFlowAnswerFields {
  /** The titles of the sub-items the person added, in their order. */
  subHabitTitles?: readonly string[]
  /** The parent the edit holds, in words. */
  parentValue?: string
  /** The goals the habit links, with their titles: the names of the goal row before or beyond the goal list. */
  linkedGoals?: readonly { id: string; title: string }[]
}

/** The names the person chose, as one list in their language: the answer of a row of the optional list. Undefined with no name, so the row shows no answer. */
export function habitFlowNamesAnswer(names: readonly string[], locale: string): string | undefined {
  const written = names.map((name) => name.trim()).filter((name) => name.length > 0)
  return written.length > 0 ? formatConjunctionList(written, locale) : undefined
}

/**
 * The names of the selected items, in the order the person selected them. The first item that holds an id names it.
 * While a selected id has no name yet, the answer is the count of the selection, so a chosen row never reads as empty.
 */
export function habitFlowSelectionAnswer<Item extends { id: string }>(
  selectedIds: readonly string[], items: readonly Item[] | undefined, nameOf: (item: Item) => string, locale: string,
): string | undefined {
  const names = selectedIds.flatMap((id) => {
    const item = items?.find((candidate) => candidate.id === id)
    return item ? [nameOf(item)] : []
  })
  if (names.length < selectedIds.length) return String(selectedIds.length)
  return habitFlowNamesAnswer(names, locale)
}

export interface EditDetailsRead<ReadError> {
  /** The flag `orbit_guided_flows`. The full form keeps its own late-read behaviour. */
  guided: boolean
  /** The habit the edit holds, or null while the edit is closed. */
  habitId: string | null
  hasDetail: boolean
  pending: boolean
  fetching: boolean
  error: ReadError | null
}

export interface GuidedEditDetails<ReadError> {
  /** The first read, or the retry of a failed one, runs. The summary shows a skeleton for each row. */
  loading: boolean
  /** The read failed. The summary states it with a retry. */
  summaryError: ReadError | null
  /** The error the toast states: one the summary does not state itself. */
  toastError: ReadError | null
  /** The summary holds no stored value yet, so the save stays off. */
  blocked: boolean
}

/**
 * What the guided edit summary shows for the stored details of the habit. The detail read fills the whole form,
 * so the summary waits for it. A habit created offline has no stored details yet: its list record is the whole
 * record, so neither a paused read nor a failed read blocks it.
 */
export function resolveGuidedEditDetails<ReadError>(read: EditDetailsRead<ReadError>): GuidedEditDetails<ReadError> {
  if (!read.guided || read.habitId === null || read.habitId.startsWith('offline-habit-')) return { loading: false, summaryError: null, toastError: read.error, blocked: false }
  const failed = !read.hasDetail && read.error !== null
  const loading = read.pending || (failed && read.fetching)
  const summaryError = failed && !read.fetching ? read.error : null
  const blocked = loading || summaryError !== null
  return { loading, summaryError, toastError: blocked ? null : read.error, blocked }
}

/** The failed detail read as the guided summary states it: the message and the retry. Null with no failed read. */
export function describeEditDetailsError(error: unknown, translate: Parameters<typeof getFriendlyErrorMessage>[1], onRetry: () => void): { message: string; onRetry: () => void } | null {
  return error ? { message: getFriendlyErrorMessage(error, translate, 'errors.fetchHabitDetails', 'habit'), onRetry } : null
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

/** What the person set on a step, and whether the item is undated. The free read of the phrase fills only the rest. */
export interface HabitReadHolds {
  /** The type the person chose on the type step. A task keeps no repeat. */
  deliberateType: 'task' | 'habit' | null
  /** The person set the When: a quick option, the free words, the calendar or the repeat step. */
  whenSet: boolean
  /** The person set the time, or a duration that starts at that time. */
  timeSet: boolean
  /** The person chose the emoji. */
  emojiSet: boolean
  /** A General item, or a child of a General parent. It saves no date, no repeat and no time. */
  undated: boolean
}

/**
 * The free read proposes; a deliberate choice of the person wins. The patch keeps only the values the
 * person did not set on a step, so a later read never replaces an answer. An undated item takes no repeat
 * and no time, because the save sends neither.
 */
export function guardHabitReadPatch(patch: HabitFormSuggestionPatch, holds: HabitReadHolds): HabitFormSuggestionPatch {
  const keepsSchedule = holds.deliberateType === 'task' || holds.whenSet || holds.undated
  return {
    ...patch,
    mode: keepsSchedule ? 'oneTime' : patch.mode,
    frequencyUnit: keepsSchedule ? null : patch.frequencyUnit,
    frequencyQuantity: keepsSchedule ? null : patch.frequencyQuantity,
    days: keepsSchedule ? [] : patch.days,
    dueTime: holds.timeSet || holds.undated ? null : patch.dueTime,
    emoji: holds.emojiSet ? null : patch.emoji,
  }
}
