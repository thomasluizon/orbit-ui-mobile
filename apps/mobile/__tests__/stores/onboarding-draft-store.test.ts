import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const asyncStorageState = vi.hoisted(() => ({
  data: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageState.data.delete(key)
    }),
  },
}))

describe('onboarding draft store', () => {
  beforeEach(() => {
    asyncStorageState.data.clear()
    useOnboardingDraftStore.getState().reset()
    useOnboardingDraftStore.setState({ _hasHydrated: false })
  })

  afterEach(() => {
    asyncStorageState.data.clear()
  })

  it('buffers habits and returns their index', () => {
    const firstIndex = useOnboardingDraftStore
      .getState()
      .bufferHabit({ title: 'Read' })
    const secondIndex = useOnboardingDraftStore
      .getState()
      .bufferHabit({ title: 'Run' })

    expect(firstIndex).toBe(0)
    expect(secondIndex).toBe(1)
    expect(useOnboardingDraftStore.getState().habits).toEqual([
      { title: 'Read' },
      { title: 'Run' },
    ])
  })

  it('reports pending answers once anything is buffered', () => {
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false)

    useOnboardingDraftStore.getState().bufferWeekStartDay(0)

    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
  })

  it('builds an apply payload from buffered answers and clears on reset', () => {
    const store = useOnboardingDraftStore.getState()
    const index = store.bufferHabit({ title: 'Meditate' })
    store.bufferFirstLog(index, '2026-07-05')
    store.bufferGoal({ title: 'Run 100km', targetValue: 100, unit: 'km' })
    store.bufferWeekStartDay(1)
    store.bufferColorScheme('blue')

    expect(useOnboardingDraftStore.getState().buildApplyPayload()).toEqual({
      habits: [{ title: 'Meditate' }],
      firstLog: { habitIndex: 0, date: '2026-07-05' },
      goal: { title: 'Run 100km', targetValue: 100, unit: 'km' },
      weekStartDay: 1,
      colorScheme: 'blue',
    })

    useOnboardingDraftStore.getState().reset()

    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false)
    expect(useOnboardingDraftStore.getState().buildApplyPayload()).toEqual({
      habits: [],
    })
  })

  it('persists buffered answers and rehydrates them, flagging hydration', async () => {
    asyncStorageState.data.set(
      'orbit-onboarding-draft',
      JSON.stringify({
        state: {
          step: 2,
          habits: [{ title: 'Stretch' }],
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

    expect(useOnboardingDraftStore.getState()).toMatchObject({
      step: 2,
      habits: [{ title: 'Stretch' }],
      weekStartDay: 1,
      onboardingLocallyDone: true,
      _hasHydrated: true,
    })
  })

  it('discards a stale-version snapshot on rehydrate', async () => {
    asyncStorageState.data.set(
      'orbit-onboarding-draft',
      JSON.stringify({
        state: { habits: 'not-an-array', onboardingLocallyDone: 'yes' },
        version: 0,
      }),
    )

    await useOnboardingDraftStore.persist.rehydrate()

    expect(useOnboardingDraftStore.getState().habits).toEqual([])
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
  })
})
