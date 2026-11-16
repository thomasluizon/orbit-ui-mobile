import { formatConjunctionList } from './conjunction-list'
import { parseDatePhrase, type DatePhraseContext } from './date-phrase-parser'
import { getFriendlyErrorMessage } from './error-utils'
import { habitPhraseRepeats, readTypedHabitPhrase, type HabitPhraseRead, type HabitPhraseSpan } from './habit-phrase-parser'
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
  if (habitPhraseRepeats(read)) return { kind: 'repeat', read }
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

/** The values the person typed in the phrase: the repeat with its days, the date and the time that the device read, and an emoji in the words. */
export interface HabitPhraseValues {
  repeat: boolean
  date: boolean
  time: boolean
  emoji: boolean
}

const EMOJI_LOOK = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u

/**
 * What the person typed in the phrase, from the device read of that phrase. A free read of the same phrase never replaces it.
 * An emoji is a symbol with the emoji look: by default, or by the request U+FE0F. A text sign such as ©, ® or ™ is not one.
 */
export function readHabitPhraseValues(phrase: string, read: Pick<HabitPhraseRead, 'cadence' | 'intervalWeeks' | 'dueTime'>, date: HabitPhraseDate | null = null): HabitPhraseValues {
  return { repeat: habitPhraseRepeats(read), date: date !== null, time: read.dueTime !== null, emoji: EMOJI_LOOK.test(phrase) }
}

/** A date the person typed in the phrase, and the words that say it. */
export interface HabitPhraseDate {
  date: string
  span: HabitPhraseSpan
}

const DATE_WORDS_MAX = 5
const WORD = /[^\s,;.!?()]+(?:[,.][^\s,;.!?()]+)*/gu
const SHORT_WEEKDAYS_THAT_ARE_WORDS = new Set(['sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'sáb'])
const FRACTION_OR_ORDINAL = /^(?:\d{1,2}[/.-]\d{1,2}|the \d{1,2}(?:st|nd|rd|th)?)$/iu

function isDateCandidate(text: string, words: readonly HabitPhraseSpan[]): boolean {
  if (FRACTION_OR_ORDINAL.test(text.slice(words[0]!.start, words.at(-1)!.end))) return false
  return words.every((word) => !SHORT_WEEKDAYS_THAT_ARE_WORDS.has(text.slice(word.start, word.end).toLowerCase()))
}

/**
 * The date words in the phrase of a new item, by the date parser of the date question. A phrase with a repeat has no date, because the
 * repeat holds the When. The run with the most words that names a day today or later wins, and the last one if two have as many words.
 * A word the repeat or the time read already took is never part of a date. A short weekday name that is also a word ("ter", "sun"),
 * a short numeric date that is also a fraction (1/2) and "the 2nd" never make a date; "on the 2nd" and a date with its year do.
 */
export function readHabitPhraseDate(phrase: string, read: Pick<HabitPhraseRead, 'cadence' | 'intervalWeeks' | 'consumed'>, context: DatePhraseContext): HabitPhraseDate | null {
  if (habitPhraseRepeats(read)) return null
  const unread = (word: HabitPhraseSpan) => read.consumed.every((token) => word.end <= token.start || word.start >= token.end)
  const words = [...phrase.matchAll(WORD)].map((match) => ({ start: match.index, end: match.index + match[0].length }))
  for (let length = Math.min(DATE_WORDS_MAX, words.length); length > 0; length -= 1) {
    for (let first = words.length - length; first >= 0; first -= 1) {
      const run = words.slice(first, first + length)
      if (!run.every(unread) || !isDateCandidate(phrase, run)) continue
      const span = { start: run[0]!.start, end: run.at(-1)!.end }
      const result = parseDatePhrase(phrase.slice(span.start, span.end), context)
      if (result.status === 'resolved' && result.date >= context.referenceDate) return { date: result.date, span }
    }
  }
  return null
}

/** What the person gave, on a step or in the words of the phrase, and whether the item is undated. The free read of the phrase fills only the rest. */
export interface HabitReadHolds {
  /** The type the person chose on the type step. A task keeps no repeat. */
  deliberateType: 'task' | 'habit' | null
  /** The person set the When on a step: a quick option, the free words, the calendar or the repeat step. */
  whenSet: boolean
  /** The person set the time on a step, or a duration that starts at that time. */
  timeSet: boolean
  /** The person chose the emoji on a step. */
  emojiSet: boolean
  /** The values the person typed in the phrase that the free read reads. */
  typed: HabitPhraseValues
  /** A General item, or a child of a General parent. It saves no date, no repeat and no time. */
  undated: boolean
}

/**
 * The one precedence rule of the free read: a value the person gave, on a step or in the words of the phrase,
 * always wins. The patch keeps only the values with no source from the person, so a read never replaces an
 * answer or a typed value. An undated item takes no repeat and no time, because the save sends neither.
 */
export function guardHabitReadPatch(patch: HabitFormSuggestionPatch, holds: HabitReadHolds): HabitFormSuggestionPatch {
  const givesWhen = holds.deliberateType === 'task' || holds.whenSet || holds.typed.repeat || holds.typed.date
  const givesTime = holds.timeSet || holds.typed.time
  const givesEmoji = holds.emojiSet || holds.typed.emoji
  const keepsSchedule = givesWhen || holds.undated
  return {
    ...patch,
    mode: keepsSchedule ? 'oneTime' : patch.mode,
    frequencyUnit: keepsSchedule ? null : patch.frequencyUnit,
    frequencyQuantity: keepsSchedule ? null : patch.frequencyQuantity,
    days: keepsSchedule ? [] : patch.days,
    dueTime: givesTime || holds.undated ? null : patch.dueTime,
    emoji: givesEmoji ? null : patch.emoji,
  }
}
