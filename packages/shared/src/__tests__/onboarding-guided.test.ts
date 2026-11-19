import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { createOnboardingDraftState, migrateOnboardingDraft, type OnboardingDraftState } from '../stores/onboarding-draft'
import {
  buildOnboardingScheduleFromPhrase,
  describeOnboardingCadence,
  describeOnboardingResult,
  describeSavedOnboardingResult,
  onboardingScheduleFromSaved,
  onboardingGuidedPosition,
  onboardingModeDetailSteps,
  onboardingStepAfterAnswer,
  onboardingModeKey,
  onboardingNeedsCadence,
  phraseLineKey,
  isOnboardingIntroScreen,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  onboardingBackTarget,
  onboardingInitialView,
  onboardingRunningStatusKey,
  onboardingViewAfterStep,
  type OnboardingGuidedNavigation,
  type OnboardingSchedule,
} from '../utils'

const base: OnboardingSchedule = { frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1, days: [], isGeneral: true, isFlexible: false, dueTime: '' }

function messageAt(messages: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
}

describe('guided onboarding navigation', () => {
  it('asks how it repeats only when the read left the schedule open and the model proposed nothing', () => {
    expect(onboardingNeedsCadence(buildOnboardingScheduleFromPhrase('Meditate', 'en'), false)).toBe(true)
    expect(onboardingNeedsCadence(buildOnboardingScheduleFromPhrase('Meditate', 'en'), true)).toBe(false)
    expect(onboardingNeedsCadence(buildOnboardingScheduleFromPhrase('Walk every Monday at 18:00', 'en'), false)).toBe(false)
    expect(onboardingNeedsCadence(buildOnboardingScheduleFromPhrase('Caminhar 3 vezes por semana', 'pt-BR'), false)).toBe(false)
  })

  it('follows each repeat mode with the steps that hold its values, the period before the count', () => {
    expect(onboardingModeDetailSteps('fixed')).toEqual(['days'])
    expect(onboardingModeDetailSteps('flexible')).toEqual(['unit', 'quantity'])
    expect(onboardingModeDetailSteps('interval')).toEqual(['unit', 'interval'])
    expect(onboardingModeDetailSteps('oneTime')).toEqual([])
  })

  it('walks the steps of a mode in order and then returns to the summary', () => {
    expect(onboardingStepAfterAnswer('flexible', 'mode', true)).toBe('unit')
    expect(onboardingStepAfterAnswer('flexible', 'unit', true)).toBe('quantity')
    expect(onboardingStepAfterAnswer('flexible', 'quantity', true)).toBe('summary')
    expect(onboardingStepAfterAnswer('interval', 'unit', true)).toBe('interval')
    expect(onboardingStepAfterAnswer('fixed', 'mode', true)).toBe('days')
    expect(onboardingStepAfterAnswer('oneTime', 'mode', true)).toBe('summary')
  })

  it('returns a step the summary opened by itself straight to the summary', () => {
    expect(onboardingStepAfterAnswer('flexible', 'unit', false)).toBe('summary')
    expect(onboardingStepAfterAnswer('interval', 'interval', false)).toBe('summary')
  })

  it('counts only the steps that remain for the draft', () => {
    expect(onboardingGuidedPosition('what', [])).toEqual({ position: 1, total: 3 })
    expect(onboardingGuidedPosition('summary', [])).toEqual({ position: 2, total: 3 })
    expect(onboardingGuidedPosition('remind', [])).toEqual({ position: 3, total: 3 })
    expect(onboardingGuidedPosition('days', ['mode', 'days'])).toEqual({ position: 3, total: 5 })
    expect(onboardingGuidedPosition('time', ['mode', 'days'])).toEqual({ position: 4, total: 5 })
    expect(onboardingGuidedPosition('unit', ['mode', 'unit', 'quantity'])).toEqual({ position: 3, total: 6 })
    expect(onboardingGuidedPosition('quantity', ['mode', 'unit', 'quantity'])).toEqual({ position: 4, total: 6 })
  })
})

describe('guided onboarding copy keys', () => {
  const schedules: Record<string, OnboardingSchedule> = {
    general: base,
    once: { ...base, isGeneral: false },
    daily: { ...base, isGeneral: false, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    fixed: { ...base, isGeneral: false, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Thursday'] },
    weeks: { ...base, isGeneral: false, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], intervalWeeks: 2 },
    flexible: { ...base, isGeneral: false, frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true },
    interval: { ...base, isGeneral: false, frequencyUnit: 'Month', frequencyQuantity: 2 },
  }

  it.each(Object.entries(schedules))('names a cadence for the %s schedule that exists in both locales, with and without a time', (_name, schedule) => {
    for (const timed of [false, true]) {
      const { key } = describeOnboardingCadence({ ...schedule, dueTime: timed ? '18:00' : '' }, timed)
      expect(typeof messageAt(en, key)).toBe('string')
      expect(typeof messageAt(ptBR, key)).toBe('string')
    }
    expect(typeof messageAt(ptBR, onboardingModeKey(schedule))).toBe('string')
  })

  it('names a weekday habit by its days and never as every day', () => {
    expect(describeOnboardingCadence(schedules.fixed!, true).key).toBe('onboarding.flow.when.cadence.fixedAt')
    expect(describeOnboardingCadence(schedules.weeks!, false)).toEqual({ key: 'onboarding.flow.when.cadence.intervalDays', count: 2 })
    expect(describeOnboardingCadence(schedules.flexible!, false)).toEqual({ key: 'onboarding.flow.when.cadence.flexible.week', count: 3 })
  })

  it('builds the result sentence from the saved schedule', () => {
    const fixed = describeOnboardingResult({ ...schedules.fixed!, dueTime: '18:00' }, '2026-11-13')
    expect(fixed.sentence.key).toBe('result.habit.repeatTimed')
    expect(fixed.cadence?.key).toBe('onboarding.flow.when.cadence.fixed')
    expect(describeOnboardingResult(schedules.flexible!, '2026-11-13').sentence.key).toBe('result.habit.repeat')
    expect(describeOnboardingResult(schedules.general!, '2026-11-13')).toEqual({ sentence: expect.objectContaining({ key: 'result.task.undated' }), cadence: null })
    expect(describeOnboardingResult({ ...schedules.once!, dueTime: '07:30' }, '2026-11-13').sentence.key).toBe('result.task.datedTimed')
  })
})

describe('the intro seen mark', () => {
  function store() {
    return create<OnboardingDraftState>()((set, get) => createOnboardingDraftState(set, get))
  }

  it('stays on the install across a reset and an account change, and survives a reload', () => {
    const draft = store()
    expect(draft.getState().introSeen).toBe(false)
    draft.getState().markIntroSeen()
    draft.getState().reset()
    draft.getState().setAccountScope('account-1')
    draft.getState().setAccountScope('account-2')
    expect(draft.getState().introSeen).toBe(true)
    expect(migrateOnboardingDraft({ introSeen: true }).introSeen).toBe(true)
    expect(migrateOnboardingDraft({}).introSeen).toBe(false)
  })
})

describe('the result sentence of the saved onboarding habit', () => {
  it('reads the schedule of a saved habit of the account', () => {
    expect(onboardingScheduleFromSaved({ frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueTime: '18:30:00', dueDate: '2026-11-16' }))
      .toEqual({ frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueTime: '18:30:00' })
  })

  it('reads a habit that waits for the account, which holds only the fields the create request sent', () => {
    expect(onboardingScheduleFromSaved({ isGeneral: true })).toEqual({ ...base, isGeneral: true })
    expect(onboardingScheduleFromSaved({ frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true })).toEqual({ ...base, frequencyUnit: 'Week', frequencyQuantity: 3, isGeneral: false, isFlexible: true })
  })

  it('starts on the due date of the record, and today when the record has none', () => {
    const saved = { frequencyUnit: 'Day' as const, frequencyQuantity: 1, days: ['Monday'], dueTime: '18:30' }
    expect(describeSavedOnboardingResult({ ...saved, dueDate: '2026-11-16' }, '2026-11-13')).toMatchObject({ start: '2026-11-16', sentence: { key: 'result.habit.repeatTimed' }, cadence: { key: 'onboarding.flow.when.cadence.fixed' } })
    expect(describeSavedOnboardingResult(saved, '2026-11-13').start).toBe('2026-11-13')
    expect(describeSavedOnboardingResult({ ...saved, dueDate: '' }, '2026-11-13').start).toBe('2026-11-13')
  })

  it('names a saved habit with no day as one with no date', () => {
    expect(describeSavedOnboardingResult({ isGeneral: true }, '2026-11-13').sentence.key).toBe('result.task.undated')
  })
})

describe('the Orbit line of the first step', () => {
  it('says what to write while the field is empty or holds spaces only', () => {
    expect(phraseLineKey('', false)).toBe('habits.flow.what.lineEmpty')
    expect(phraseLineKey('   ', true)).toBe('habits.flow.what.lineEmpty')
  })

  it('says what the device read once it read a part, and that the details are left when it read none', () => {
    expect(phraseLineKey('walk every day', true)).toBe('habits.flow.what.lineUnderstood')
    expect(phraseLineKey('walk', false)).toBe('habits.flow.what.lineTyped')
  })
})

describe('guided onboarding views and back targets', () => {
  const at = (view: OnboardingGuidedNavigation['view'], patch: Partial<OnboardingGuidedNavigation> = {}): OnboardingGuidedNavigation => ({ view, direction: 1, cadencePath: [], editing: false, walking: false, pendingEdit: null, ...patch })

  it('opens on the intro on a first run, else on the view of the step', () => {
    expect(onboardingInitialView(ONBOARDING_WHAT_STEP, true)).toBe('talk')
    expect(onboardingInitialView(ONBOARDING_WHAT_STEP, false)).toBe('what')
    expect(onboardingInitialView(ONBOARDING_WHEN_STEP, false)).toBe('summary')
    expect(onboardingInitialView(ONBOARDING_REMIND_STEP, false)).toBe('remind')
  })

  it('asks how it repeats after the phrase only when the read left the schedule open, and opens a pending edit after the remind step', () => {
    expect(onboardingViewAfterStep(at('what'), ONBOARDING_WHAT_STEP, ONBOARDING_WHEN_STEP, true)).toMatchObject({ view: 'mode', cadencePath: ['mode'], direction: 1 })
    expect(onboardingViewAfterStep(at('what'), ONBOARDING_WHAT_STEP, ONBOARDING_WHEN_STEP, false)).toMatchObject({ view: 'summary', cadencePath: [] })
    expect(onboardingViewAfterStep(at('remind', { pendingEdit: 'time' }), ONBOARDING_REMIND_STEP, ONBOARDING_WHEN_STEP, false)).toMatchObject({ view: 'time', editing: true, pendingEdit: null, direction: -1 })
  })

  it('goes back through the intro, the repeat steps and the summary, and hands the rest to the previous step', () => {
    expect(onboardingBackTarget(at('talk'), true)).toBeNull()
    expect(onboardingBackTarget(at('routine'), true)).toBe('talk')
    expect(onboardingBackTarget(at('what'), true)).toBe('restart')
    expect(onboardingBackTarget(at('what'), false)).toBeNull()
    expect(onboardingBackTarget(at('what', { editing: true }), false), 'the phrase opened from the summary').toBe('summary')
    expect(onboardingBackTarget(at('what', { editing: true }), true)).toBe('summary')
    expect(onboardingBackTarget(at('time', { editing: true }), false)).toBe('summary')
    expect(onboardingBackTarget(at('summary', { cadencePath: ['mode', 'days'] }), false)).toBe('days')
    expect(onboardingBackTarget(at('days', { cadencePath: ['mode', 'days'] }), false)).toBe('mode')
    expect(onboardingBackTarget(at('mode', { cadencePath: ['mode', 'days'] }), false)).toBe('step')
    expect(isOnboardingIntroScreen('restart')).toBe(true)
    expect(isOnboardingIntroScreen('remind')).toBe(false)
  })

  it('names the request that runs, the read first', () => {
    const idle = { suggestionPending: false, creating: false, reminderDecision: 'idle', completionPending: false }
    expect(onboardingRunningStatusKey(idle)).toBeNull()
    expect(onboardingRunningStatusKey({ ...idle, suggestionPending: true, creating: true })).toBe('habits.flow.what.reading')
    expect(onboardingRunningStatusKey({ ...idle, creating: true })).toBe('onboarding.flow.guided.creating')
    expect(onboardingRunningStatusKey({ ...idle, reminderDecision: 'declining' })).toBe('onboarding.flow.guided.remind.pending')
  })
})
