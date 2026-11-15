import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { createOnboardingDraftState, migrateOnboardingDraft, type OnboardingDraftState } from '../stores/onboarding-draft'
import {
  buildOnboardingScheduleFromPhrase,
  describeOnboardingCadence,
  describeOnboardingResult,
  onboardingGuidedPosition,
  onboardingModeDetailSteps,
  onboardingStepAfterAnswer,
  onboardingModeKey,
  onboardingNeedsCadence,
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
