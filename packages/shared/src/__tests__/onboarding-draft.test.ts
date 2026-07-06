import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import {
  buildApplyOnboardingPayload,
  createOnboardingDraftState,
  getPersistedOnboardingDraft,
  migrateOnboardingDraft,
  type OnboardingDraftState,
} from '../stores/onboarding-draft'

function makeStore() {
  return createStore<OnboardingDraftState>((set, get) =>
    createOnboardingDraftState(set, get),
  )
}

describe('onboarding draft store', () => {
  it('buffers habits and returns their index', () => {
    const store = makeStore()
    const first = store.getState().bufferHabit({ title: 'Drink water' })
    const second = store.getState().bufferHabit({ title: 'Read' })

    expect(first).toBe(0)
    expect(second).toBe(1)
    expect(store.getState().habits).toHaveLength(2)
  })

  it('builds an apply payload from buffered answers', () => {
    const store = makeStore()
    store.getState().bufferHabit({ title: 'Drink water', frequencyUnit: 'Day' })
    store.getState().bufferFirstLog(0, '2026-07-05')
    store.getState().bufferGoal({ title: 'Run 100km', targetValue: 100, unit: 'km' })
    store.getState().bufferWeekStartDay(0)
    store.getState().bufferColorScheme('blue')

    const payload = store.getState().buildApplyPayload()

    expect(payload).toEqual({
      habits: [{ title: 'Drink water', frequencyUnit: 'Day' }],
      firstLog: { habitIndex: 0, date: '2026-07-05' },
      goal: { title: 'Run 100km', targetValue: 100, unit: 'km' },
      weekStartDay: 0,
      colorScheme: 'blue',
    })
  })

  it('omits optional fields that were never buffered', () => {
    const store = makeStore()
    store.getState().bufferHabit({ title: 'Meditate' })

    const payload = store.getState().buildApplyPayload()

    expect(payload).toEqual({ habits: [{ title: 'Meditate' }] })
  })

  it('reports pending answers only after something is buffered', () => {
    const store = makeStore()
    expect(store.getState().hasPendingAnswers()).toBe(false)

    store.getState().markOnboardingLocallyDone()
    expect(store.getState().hasPendingAnswers()).toBe(true)
  })

  it('resets back to the initial draft', () => {
    const store = makeStore()
    store.getState().bufferHabit({ title: 'Drink water' })
    store.getState().markOnboardingLocallyDone()

    store.getState().reset()

    const persisted = getPersistedOnboardingDraft(store.getState())
    expect(persisted.habits).toHaveLength(0)
    expect(persisted.onboardingLocallyDone).toBe(false)
  })

  it('migrates unknown persisted shapes to a clean draft', () => {
    expect(migrateOnboardingDraft(null)).toEqual({
      step: 0,
      habits: [],
      firstLog: null,
      goal: null,
      weekStartDay: null,
      colorScheme: null,
      onboardingLocallyDone: false,
    })

    const partial = migrateOnboardingDraft({ step: 3, onboardingLocallyDone: true })
    expect(partial.step).toBe(3)
    expect(partial.onboardingLocallyDone).toBe(true)
    expect(partial.habits).toEqual([])
  })

  it('round-trips a payload through the pure builder', () => {
    const payload = buildApplyOnboardingPayload({
      step: 6,
      habits: [{ title: 'Stretch' }],
      firstLog: null,
      goal: null,
      weekStartDay: 1,
      colorScheme: null,
      onboardingLocallyDone: true,
    })

    expect(payload).toEqual({ habits: [{ title: 'Stretch' }], weekStartDay: 1 })
  })
})
