import type { FrequencyUnit } from '../types/habit'
import { describeHabitResult, type HabitResultSentence } from './habit-flow'
import { getOnboardingScheduleMode, ONBOARDING_REMIND_STEP, ONBOARDING_WHAT_STEP, ONBOARDING_WHEN_STEP, type OnboardingSchedule, type OnboardingScheduleMode } from './onboarding'

/** The three intro screens, in order: who Orbit is, what it does with the words, and the restart after a miss. */
export const ONBOARDING_INTRO_SCREENS = ['talk', 'routine', 'restart'] as const
export type OnboardingIntroScreen = (typeof ONBOARDING_INTRO_SCREENS)[number]

/** The question steps of the guided onboarding, after the intro. */
export type OnboardingQuestionStep = 'what' | 'mode' | 'unit' | 'days' | 'quantity' | 'interval' | 'time' | 'summary' | 'remind'

export const ONBOARDING_MODE_OPTIONS: readonly OnboardingScheduleMode[] = ['fixed', 'flexible', 'interval', 'oneTime']

/** The periods of a count or an interval, as the quick options of the period question. */
export const ONBOARDING_UNIT_OPTIONS: readonly FrequencyUnit[] = ['Day', 'Week', 'Month', 'Year']

const DETAIL_STEPS_BY_MODE: Record<OnboardingScheduleMode, readonly OnboardingQuestionStep[]> = {
  fixed: ['days'],
  flexible: ['unit', 'quantity'],
  interval: ['unit', 'interval'],
  oneTime: [],
}

/** Whether the read left the schedule open: no repeat, no day and no count. Only then the flow asks how it repeats. */
export function onboardingNeedsCadence(schedule: OnboardingSchedule, proposed: boolean): boolean {
  if (proposed) return false
  return schedule.isGeneral && schedule.frequencyUnit === null && schedule.days.length === 0 && !schedule.isFlexible
}

/** The steps that hold the values of a repeat mode, in the order the flow asks them. A count or an interval asks its period first. A one-time habit has none. */
export function onboardingModeDetailSteps(mode: OnboardingScheduleMode): readonly OnboardingQuestionStep[] {
  return DETAIL_STEPS_BY_MODE[mode]
}

/**
 * The step after an answer inside the repeat steps. While the flow walks the steps of a mode, it is the next
 * step of that mode, then the summary. A step the summary opened by itself returns to the summary.
 */
export function onboardingStepAfterAnswer(mode: OnboardingScheduleMode, answered: OnboardingQuestionStep, walking: boolean): OnboardingQuestionStep {
  if (!walking) return 'summary'
  const steps = onboardingModeDetailSteps(mode)
  return steps[steps.indexOf(answered) + 1] ?? 'summary'
}

/**
 * Progress counts only the steps this draft still meets: the phrase, the steps the read left open,
 * the summary and the reminder. A step opened from the summary shows the position of the summary.
 */
export function onboardingGuidedPosition(step: OnboardingQuestionStep, cadencePath: readonly OnboardingQuestionStep[]): { position: number; total: number } {
  const path: OnboardingQuestionStep[] = ['what', ...cadencePath, 'summary', 'remind']
  const index = path.indexOf(step)
  return { position: (index < 0 ? path.indexOf('summary') : index) + 1, total: path.length }
}

export interface OnboardingCadenceText {
  /** A full i18n key. */
  key: string
  count: number
}

const CADENCE = 'onboarding.flow.when.cadence'

function lowerUnit(unit: OnboardingSchedule['frequencyUnit'], fallback: 'day' | 'week'): string {
  return unit ? unit.toLowerCase() : fallback
}

/** The cadence of a schedule as one full templated string, with or without the time. A habit with no set day has its own string. */
export function describeOnboardingCadence(schedule: OnboardingSchedule, timed: boolean): OnboardingCadenceText {
  const at = (base: string) => `${base}${timed ? 'At' : ''}`
  const quantity = schedule.frequencyQuantity ?? 1
  if (schedule.isFlexible) return { key: `${CADENCE}.${at('flexible')}.${lowerUnit(schedule.frequencyUnit, 'week')}`, count: quantity }
  if (schedule.frequencyUnit === null && !schedule.isGeneral) return { key: `${CADENCE}.${at('once')}`, count: 1 }
  if (schedule.days.length === 0 && schedule.isGeneral) return { key: `onboarding.flow.guided.cadence.${at('noDate')}`, count: 1 }
  if (schedule.days.length === 7 && schedule.intervalWeeks === 1) return { key: `${CADENCE}.${at('daily')}`, count: 1 }
  if (schedule.days.length > 0 && schedule.intervalWeeks === 1) return { key: `${CADENCE}.${at('fixed')}`, count: 1 }
  if (schedule.days.length > 0) return { key: `${CADENCE}.${at('intervalDays')}`, count: schedule.intervalWeeks }
  return { key: `${CADENCE}.${at('intervalUnit')}.${lowerUnit(schedule.frequencyUnit, 'day')}`, count: quantity }
}

export interface OnboardingResultSentence {
  sentence: HabitResultSentence
  /** The cadence text the `{cadence}` slot takes, without the time: the sentence carries the time. */
  cadence: OnboardingCadenceText | null
}

/**
 * The result dialog sentence of a schedule that starts on `today`. A weekday schedule takes the onboarding cadence,
 * because the R07 cadence names only the unit and would call Monday and Thursday "every day".
 */
export function describeOnboardingResult(schedule: OnboardingSchedule, today: string): OnboardingResultSentence {
  const repeats = schedule.frequencyUnit !== null || schedule.isFlexible
  const sentence = describeHabitResult({
    itemType: repeats ? 'habit' : 'task',
    isGeneral: schedule.isGeneral,
    dueDate: schedule.isGeneral ? null : today,
    dueTime: schedule.dueTime || null,
    frequencyUnit: repeats ? schedule.frequencyUnit ?? 'Week' : null,
    frequencyQuantity: schedule.frequencyQuantity,
  }, 'created')
  return { sentence, cadence: sentence.cadence ? describeOnboardingCadence(schedule, false) : null }
}

/** The fields of a saved habit that the result sentence reads: a habit of the account, or the habit that waits on this device before sign-in. */
export interface OnboardingSavedHabit {
  frequencyUnit?: FrequencyUnit | null
  frequencyQuantity?: number | null
  intervalWeeks?: number | null
  days?: readonly string[] | null
  isGeneral?: boolean | null
  isFlexible?: boolean | null
  dueTime?: string | null
  dueDate?: string | null
}

/** The schedule of a saved habit. A field the record does not hold takes the value of a habit with no repeat, no day and no time. */
export function onboardingScheduleFromSaved(saved: OnboardingSavedHabit): OnboardingSchedule {
  return {
    frequencyUnit: saved.frequencyUnit ?? null,
    frequencyQuantity: saved.frequencyQuantity ?? null,
    intervalWeeks: saved.intervalWeeks ?? 1,
    days: [...(saved.days ?? [])],
    isGeneral: saved.isGeneral ?? false,
    isFlexible: saved.isFlexible ?? false,
    dueTime: saved.dueTime ?? '',
  }
}

/**
 * The result dialog sentence of the onboarding habit, from the saved record and never from the draft.
 * The start is the due date of the record. A record with no due date yet, such as the habit that waits for the account, starts today.
 */
export function describeSavedOnboardingResult(saved: OnboardingSavedHabit, today: string): OnboardingResultSentence & { schedule: OnboardingSchedule; start: string } {
  const schedule = onboardingScheduleFromSaved(saved)
  const start = saved.dueDate || today
  return { ...describeOnboardingResult(schedule, start), schedule, start }
}

/** The summary value of the repeat mode. */
export function onboardingModeKey(schedule: OnboardingSchedule): string {
  return `onboarding.flow.guided.mode.${getOnboardingScheduleMode(schedule)}`
}

/** The Orbit line of the first step of a guided create flow: what to write while it is empty, what the device read once it read a part, and the rest after that. */
export function phraseLineKey(value: string, understood: boolean): 'habits.flow.what.lineEmpty' | 'habits.flow.what.lineUnderstood' | 'habits.flow.what.lineTyped' {
  if (value.trim().length === 0) return 'habits.flow.what.lineEmpty'
  return understood ? 'habits.flow.what.lineUnderstood' : 'habits.flow.what.lineTyped'
}

/** One view of the guided onboarding: an intro screen or a question step. */
export type OnboardingFlowView = OnboardingIntroScreen | OnboardingQuestionStep

/** Where the guided onboarding stands, and how it reached that view. */
export interface OnboardingGuidedNavigation {
  view: OnboardingFlowView
  direction: 1 | -1
  /** The repeat steps this draft walks, in order. */
  cadencePath: OnboardingQuestionStep[]
  /** The summary opened this step, so the answer returns to the summary. */
  editing: boolean
  /** The flow walks the steps of a repeat mode. */
  walking: boolean
  /** The step that the remind step opens after the flow returns to the When step. */
  pendingEdit: OnboardingQuestionStep | null
}

/** A target of the back action: a view, the previous step of `OnboardingFlow`, or no back action. */
export type OnboardingBackTarget = OnboardingFlowView | 'step' | null

export function isOnboardingIntroScreen(view: OnboardingFlowView): view is OnboardingIntroScreen {
  return (ONBOARDING_INTRO_SCREENS as readonly string[]).includes(view)
}

/** The first view: the intro on a first run, else the view of the step that `OnboardingFlow` opens on. */
export function onboardingInitialView(step: number, introRun: boolean): OnboardingFlowView {
  if (introRun) return 'talk'
  if (step === ONBOARDING_REMIND_STEP) return 'remind'
  return step === ONBOARDING_WHEN_STEP ? 'summary' : 'what'
}

/** The view after `OnboardingFlow` moves from one step to another. */
export function onboardingViewAfterStep(navigation: OnboardingGuidedNavigation, previous: number, step: number, needsCadence: boolean): OnboardingGuidedNavigation {
  const direction = step > previous ? 1 : -1
  if (step === ONBOARDING_WHAT_STEP) return { ...navigation, view: 'what', direction, editing: false, cadencePath: [] }
  if (step === ONBOARDING_REMIND_STEP) return { ...navigation, view: 'remind', direction, editing: false }
  if (previous === ONBOARDING_WHAT_STEP) return { ...navigation, view: needsCadence ? 'mode' : 'summary', direction, editing: false, cadencePath: needsCadence ? ['mode'] : [] }
  const target = navigation.pendingEdit ?? 'summary'
  return { ...navigation, view: target, direction, editing: target !== 'summary', pendingEdit: null }
}

/** The target of the back action on the current view. */
export function onboardingBackTarget(navigation: OnboardingGuidedNavigation, introRun: boolean): OnboardingBackTarget {
  const { view, editing, cadencePath } = navigation
  if (view === 'talk') return null
  if (isOnboardingIntroScreen(view)) return ONBOARDING_INTRO_SCREENS[ONBOARDING_INTRO_SCREENS.indexOf(view) - 1]!
  if (view === 'what') return introRun ? 'restart' : null
  if (editing) return 'summary'
  if (view === 'summary') return cadencePath.at(-1) ?? 'step'
  const index = cadencePath.indexOf(view)
  return index > 0 ? cadencePath[index - 1]! : 'step'
}

/** The status line key while a request runs: the read of the phrase, the create, or the reminder decision. */
export function onboardingRunningStatusKey(state: { suggestionPending: boolean; creating: boolean; reminderDecision: string; completionPending: boolean }): string | null {
  if (state.suggestionPending) return 'habits.flow.what.reading'
  if (state.creating) return 'onboarding.flow.guided.creating'
  return state.reminderDecision !== 'idle' || state.completionPending ? 'onboarding.flow.guided.remind.pending' : null
}
