import type { HabitPhraseRead } from './habit-phrase-parser'

/** The steps of the guided habit flow, in the order a person meets them. */
export type HabitFlowStepId = 'what' | 'when' | 'time' | 'reminder' | 'summary'

export interface HabitFlowAnswers {
  /** The person answered the "when" step, with a quick option, the free path or the calendar. */
  when: boolean
  /** The person answered the "time" step, including "no set time". */
  time: boolean
}

export interface RemainingHabitFlowStepsInput {
  mode: 'create' | 'edit'
  /** The phrase, the route parameters or the draft already hold a date or a repetition. */
  hasDateOrRepeat: boolean
  /** A time exists on the draft. */
  hasTime: boolean
  /** The phrase read a time. */
  phraseGaveTime: boolean
  /** The parent is General, so the item stays undated and the date question never shows. */
  whenLocked: boolean
  answers: HabitFlowAnswers
}

/**
 * The steps that remain for this draft. Edit opens on the summary alone. A step whose value the
 * phrase or an earlier answer already gave does not show, so progress counts only what remains.
 */
export function remainingHabitFlowSteps(input: RemainingHabitFlowStepsInput): HabitFlowStepId[] {
  if (input.mode === 'edit') return ['summary']
  const steps: HabitFlowStepId[] = ['what']
  const whenKnown = input.hasDateOrRepeat || input.answers.when || input.whenLocked
  if (!whenKnown) steps.push('when')
  const timeKnown = input.phraseGaveTime || input.answers.time
  if (!timeKnown && !input.whenLocked) steps.push('time')
  if (input.hasTime) steps.push('reminder')
  steps.push('summary')
  return steps
}

export interface PhraseCoverage {
  coversDateOrRepeat: boolean
  coversTime: boolean
}

/** What a local read of the phrase covers. The `consumed` ranges tell which words the device read. */
export function readPhraseCoverage(read: HabitPhraseRead, hasPhraseDate: boolean): PhraseCoverage {
  return {
    coversDateOrRepeat: hasPhraseDate || read.cadence !== null,
    coversTime: read.dueTime !== null,
  }
}

/**
 * When the person edits the phrase after later steps have answers, the answers that the new phrase
 * covers reset. The other answers stay.
 */
export function resetCoveredAnswers(answers: HabitFlowAnswers, coverage: PhraseCoverage): HabitFlowAnswers {
  return {
    when: coverage.coversDateOrRepeat ? false : answers.when,
    time: coverage.coversTime ? false : answers.time,
  }
}

/** The local read left cadence, date or time words unread, so the AI read can help once. */
export function phraseLeavesWordsUnread(phrase: string, read: HabitPhraseRead, hasPhraseDate: boolean): boolean {
  const text = phrase.trim()
  if (text.length === 0) return false
  const coverage = readPhraseCoverage(read, hasPhraseDate)
  return !coverage.coversDateOrRepeat || !coverage.coversTime
}

export type HabitResultItem = {
  itemType: 'task' | 'habit'
  isGeneral: boolean
  dueDate: string | null
  dueTime: string | null
  frequencyUnit: 'Day' | 'Week' | 'Month' | 'Year' | null
  frequencyQuantity: number | null
}

/** The facts a draft saves, for a create that a queue holds until the server record exists. */
export function optimisticHabitResult(values: {
  itemType?: 'task' | 'habit' | null | undefined
  isGeneral?: boolean | undefined
  dueDate?: string | null | undefined
  dueTime?: string | null | undefined
  frequencyUnit?: HabitResultItem['frequencyUnit'] | undefined
  frequencyQuantity?: number | null | undefined
}): HabitResultItem {
  return {
    itemType: values.itemType === 'habit' ? 'habit' : 'task',
    isGeneral: values.isGeneral ?? false,
    dueDate: values.dueDate || null,
    dueTime: values.dueTime || null,
    frequencyUnit: values.frequencyUnit ?? null,
    frequencyQuantity: values.frequencyQuantity ?? null,
  }
}

export type HabitResultSentenceKey =
  | 'result.task.dated'
  | 'result.task.datedTimed'
  | 'result.task.undated'
  | 'result.habit.repeat'
  | 'result.habit.repeatTimed'
  | 'result.habit.updated'

export interface HabitResultSentence {
  key: HabitResultSentenceKey
  needsDate: boolean
  needsTime: boolean
  /** The key and count of the cadence words of a habit, when the sentence names a cadence. */
  cadence: { key: 'result.cadence.day' | 'result.cadence.week' | 'result.cadence.month' | 'result.cadence.year'; count: number } | null
}

const CADENCE_KEYS = {
  Day: 'result.cadence.day',
  Week: 'result.cadence.week',
  Month: 'result.cadence.month',
  Year: 'result.cadence.year',
} as const

/**
 * Picks the one full templated sentence for a saved record. The caller formats the date and the time
 * with `Intl`, the clock setting and the account time zone, and passes them as values. The record is
 * the saved one, read back from the query cache, never the draft.
 */
export function describeHabitResult(item: HabitResultItem, change: 'created' | 'updated'): HabitResultSentence {
  if (change === 'updated') {
    return { key: 'result.habit.updated', needsDate: false, needsTime: false, cadence: null }
  }
  if (item.itemType === 'habit' && item.frequencyUnit) {
    const cadence = { key: CADENCE_KEYS[item.frequencyUnit], count: item.frequencyQuantity ?? 1 }
    const timed = item.dueTime !== null
    return { key: timed ? 'result.habit.repeatTimed' : 'result.habit.repeat', needsDate: true, needsTime: timed, cadence }
  }
  if (item.isGeneral || item.dueDate === null) {
    return { key: 'result.task.undated', needsDate: false, needsTime: false, cadence: null }
  }
  const timed = item.dueTime !== null
  return { key: timed ? 'result.task.datedTimed' : 'result.task.dated', needsDate: true, needsTime: timed, cadence: null }
}

/** The filled action of the result dialog: Today when the item shows on today's list, else Calendar. */
export function resolveResultDestination(item: Pick<HabitResultItem, 'dueDate' | 'isGeneral'>, today: string): 'today' | 'calendar' {
  if (item.isGeneral) return 'today'
  if (item.dueDate === null) return 'today'
  return item.dueDate <= today ? 'today' : 'calendar'
}
