import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import type { CreateHabitRequest } from '@orbit/shared/types/habit'

const STORAGE_KEY = 'orbit-onboarding-draft'

function habit(title: string): CreateHabitRequest {
  return { title, frequencyUnit: 'Day', frequencyQuantity: 1 }
}

describe('onboarding draft store', () => {
  beforeEach(() => {
    useOnboardingDraftStore.getState().reset()
    globalThis.localStorage.removeItem(STORAGE_KEY)
  })

  it('buffers habits and returns their index', () => {
    const store = useOnboardingDraftStore.getState()
    expect(store.bufferHabit(habit('Read'))).toBe(0)
    expect(store.bufferHabit(habit('Run'))).toBe(1)
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(2)
  })

  it('reports pending answers once anything is buffered', () => {
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false)
    useOnboardingDraftStore.getState().bufferWeekStartDay(0)
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
  })

  it('builds an apply payload from every buffered answer', () => {
    const store = useOnboardingDraftStore.getState()
    const index = store.bufferHabit(habit('Meditate'))
    store.bufferFirstLog(index, '2026-07-05')
    store.bufferGoal({ title: 'Run 100km', targetValue: 100, unit: 'km' })
    store.bufferWeekStartDay(1)
    store.bufferColorScheme('blue')

    const payload = useOnboardingDraftStore.getState().buildApplyPayload()
    expect(payload.habits).toHaveLength(1)
    expect(payload.firstLog).toEqual({ habitIndex: 0, date: '2026-07-05' })
    expect(payload.goal?.title).toBe('Run 100km')
    expect(payload.weekStartDay).toBe(1)
    expect(payload.colorScheme).toBe('blue')
  })

  it('persists buffered answers to localStorage', () => {
    useOnboardingDraftStore.getState().bufferHabit(habit('Stretch'))
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).toContain('Stretch')
  })

  it('rehydrates buffered answers from a persisted snapshot', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          step: 2,
          habits: [habit('Journal')],
          firstLog: null,
          goal: null,
          weekStartDay: 1,
          colorScheme: null,
          onboardingLocallyDone: true,
        },
        version: 1,
      }),
    )

    await useOnboardingDraftStore.persist.rehydrate()

    const state = useOnboardingDraftStore.getState()
    expect(state.habits).toHaveLength(1)
    expect(state.onboardingLocallyDone).toBe(true)
    expect(state.hasPendingAnswers()).toBe(true)
  })

  it('clears every answer on reset', () => {
    const store = useOnboardingDraftStore.getState()
    store.bufferHabit(habit('Walk'))
    store.markOnboardingLocallyDone()
    store.reset()

    const state = useOnboardingDraftStore.getState()
    expect(state.habits).toHaveLength(0)
    expect(state.onboardingLocallyDone).toBe(false)
    expect(state.hasPendingAnswers()).toBe(false)
  })
})
