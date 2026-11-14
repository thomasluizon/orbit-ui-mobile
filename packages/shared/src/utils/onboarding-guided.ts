import { describeHabitResult, type HabitResultSentence } from './habit-flow'
import { getOnboardingScheduleMode, type OnboardingSchedule, type OnboardingScheduleMode } from './onboarding'

/** The three intro screens, in order: who Orbit is, what it does with the words, and the restart after a miss. */
export const ONBOARDING_INTRO_SCREENS = ['talk', 'routine', 'restart'] as const
export type OnboardingIntroScreen = (typeof ONBOARDING_INTRO_SCREENS)[number]

/** The question steps of the guided onboarding, after the intro. */
export type OnboardingQuestionStep = 'what' | 'mode' | 'days' | 'quantity' | 'interval' | 'time' | 'summary' | 'remind'

export const ONBOARDING_MODE_OPTIONS: readonly OnboardingScheduleMode[] = ['fixed', 'flexible', 'interval', 'oneTime']

const DETAIL_STEP_BY_MODE: Record<OnboardingScheduleMode, OnboardingQuestionStep | null> = {
  fixed: 'days',
  flexible: 'quantity',
  interval: 'interval',
  oneTime: null,
}

/** Whether the read left the schedule open: no repeat, no day and no count. Only then the flow asks how it repeats. */
export function onboardingNeedsCadence(schedule: OnboardingSchedule, proposed: boolean): boolean {
  if (proposed) return false
  return schedule.isGeneral && schedule.frequencyUnit === null && schedule.days.length === 0 && !schedule.isFlexible
}

/** The step that holds the value of a repeat mode. A one-time habit has none. */
export function onboardingModeDetailStep(mode: OnboardingScheduleMode): OnboardingQuestionStep | null {
  return DETAIL_STEP_BY_MODE[mode]
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
  if (schedule.days.length === 0 && schedule.isGeneral) return { key: `onboarding.flow.guided.cadence.${at('noDays')}`, count: 1 }
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
 * The result dialog sentence of the onboarding habit, from the schedule the create request saved.
 * The habit starts on the account day it was created. A weekday schedule takes the onboarding cadence,
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

/** The summary value of the repeat mode. */
export function onboardingModeKey(schedule: OnboardingSchedule): string {
  return `onboarding.flow.guided.mode.${getOnboardingScheduleMode(schedule)}`
}

/** The Orbit line of the first step of a guided create flow: what to write while it is empty, what the device read once it read a part, and the rest after that. */
export function phraseLineKey(value: string, understood: boolean): 'habits.flow.what.lineEmpty' | 'habits.flow.what.lineUnderstood' | 'habits.flow.what.lineTyped' {
  if (value.trim().length === 0) return 'habits.flow.what.lineEmpty'
  return understood ? 'habits.flow.what.lineUnderstood' : 'habits.flow.what.lineTyped'
}
