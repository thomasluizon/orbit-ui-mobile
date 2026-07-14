import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const mocks = vi.hoisted(() => ({
  createHabit: vi.fn(),
  bulkCreate: vi.fn(),
  logHabit: vi.fn(),
  createGoal: vi.fn(),
  completeOnboarding: vi.fn(),
  updateColorScheme: vi.fn(),
  updateWeekStartDay: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: mocks.createHabit }),
  useBulkCreateHabits: () => ({ mutateAsync: mocks.bulkCreate }),
  useLogHabit: () => ({ mutateAsync: mocks.logHabit }),
}))

vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutateAsync: mocks.createGoal }),
}))

vi.mock('@/app/actions/profile', () => ({
  completeOnboarding: (...args: unknown[]) => mocks.completeOnboarding(...args),
  updateColorScheme: (...args: unknown[]) => mocks.updateColorScheme(...args),
  updateWeekStartDay: (...args: unknown[]) => mocks.updateWeekStartDay(...args),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return { ...actual, useQueryClient: () => ({ setQueryData: mocks.setQueryData, invalidateQueries: mocks.invalidateQueries }) }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  useBufferOnboardingActions,
  useLiveOnboardingActions,
  useOnboardingActions,
  useOnboardingHasProAccess,
  useOnboardingIsLive,
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

describe('buffer onboarding actions', () => {
  beforeEach(() => {
    pushMock.mockReset()
    useOnboardingDraftStore.getState().reset()
  })

  it('buffers a created habit into the draft store and returns its index id', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    const created = await result.current.createHabit({
      title: 'Read',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })

    expect(created).toEqual({ id: '0', title: 'Read' })
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(1)
  })

  it('omits the import action in pre-auth mode', () => {
    const { result } = renderHook(() => useBufferOnboardingActions())
    expect(result.current.onImport).toBeUndefined()
  })

  it('marks the draft done and routes to signup on finish', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.finishOnboarding()

    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
    expect(pushMock).toHaveBeenCalledWith('/login?from=onboarding')
  })

  it('buffers the first log against the created habit index', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.createHabit({ title: 'Run', frequencyUnit: 'Day', frequencyQuantity: 1 })
    await result.current.logHabit('0')

    expect(useOnboardingDraftStore.getState().firstLog?.habitIndex).toBe(0)
  })

  it('buffers a bulk of habits, keeping only the provided optional fields', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.createHabitsBulk([
      { title: 'Water', emoji: '💧', frequencyUnit: 'Day', frequencyQuantity: 2, isGeneral: false },
      { title: 'Journal' },
    ])

    const habits = useOnboardingDraftStore.getState().habits
    expect(habits).toHaveLength(2)
    expect(habits[0]).toMatchObject({ title: 'Water', emoji: '💧', frequencyQuantity: 2 })
    expect(habits[1]?.emoji).toBeUndefined()
  })

  it('buffers the goal, week-start day, and color scheme', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.createGoal({ title: 'Read 12 books', targetValue: 12, unit: 'books' })
    await result.current.setWeekStartDay(1)
    await result.current.setColorScheme('emerald')

    const state = useOnboardingDraftStore.getState()
    expect(state.goal?.title).toBe('Read 12 books')
    expect(state.weekStartDay).toBe(1)
    expect(state.colorScheme).toBe('emerald')
  })
})

describe('live onboarding actions', () => {
  beforeEach(() => {
    pushMock.mockReset()
    Object.values(mocks).forEach((fn) => fn.mockReset())
    mocks.createHabit.mockResolvedValue({ id: 'h-1' })
    mocks.bulkCreate.mockResolvedValue(undefined)
    mocks.logHabit.mockResolvedValue(undefined)
    mocks.createGoal.mockResolvedValue(undefined)
    mocks.completeOnboarding.mockResolvedValue(undefined)
    mocks.updateColorScheme.mockResolvedValue(undefined)
    mocks.updateWeekStartDay.mockResolvedValue(undefined)
  })

  it('creates a habit and returns the server id with the input title', async () => {
    const { result } = renderHook(() => useLiveOnboardingActions())
    const created = await result.current.createHabit({ title: 'Meditate', frequencyUnit: 'Day', frequencyQuantity: 1 })
    expect(mocks.createHabit).toHaveBeenCalledWith({ title: 'Meditate', frequencyUnit: 'Day', frequencyQuantity: 1 })
    expect(created).toEqual({ id: 'h-1', title: 'Meditate' })
  })

  it('forwards bulk, log, and goal mutations', async () => {
    const { result } = renderHook(() => useLiveOnboardingActions())
    await result.current.createHabitsBulk([{ title: 'Stretch' }])
    await result.current.logHabit('h-9')
    await result.current.createGoal({ title: 'Run 100km', targetValue: 100, unit: 'km' })
    expect(mocks.bulkCreate).toHaveBeenCalledWith({ habits: [{ title: 'Stretch' }] })
    expect(mocks.logHabit).toHaveBeenCalledWith({ habitId: 'h-9' })
    expect(mocks.createGoal).toHaveBeenCalledWith({ title: 'Run 100km', targetValue: 100, unit: 'km' })
  })

  it('optimistically patches the profile week-start day then persists and invalidates', async () => {
    const { result } = renderHook(() => useLiveOnboardingActions())
    await result.current.setWeekStartDay(0)
    expect(mocks.updateWeekStartDay).toHaveBeenCalledWith({ weekStartDay: 0 })
    expect(mocks.invalidateQueries).toHaveBeenCalled()
    const updater = mocks.setQueryData.mock.calls[0]![1] as (old: unknown) => unknown
    expect(updater({ weekStartDay: 1 })).toMatchObject({ weekStartDay: 0 })
    expect(updater(undefined)).toBeUndefined()
  })

  it('persists the color scheme', async () => {
    const { result } = renderHook(() => useLiveOnboardingActions())
    await result.current.setColorScheme('violet')
    expect(mocks.updateColorScheme).toHaveBeenCalledWith({ colorScheme: 'violet' })
  })

  it('finishes onboarding and routes home even when completion fails', async () => {
    mocks.completeOnboarding.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useLiveOnboardingActions())
    await result.current.finishOnboarding()
    expect(mocks.setQueryData).toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('seeds the chat draft and opens Astra on import', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useLiveOnboardingActions())
    result.current.onImport?.()
    expect(setItem).toHaveBeenCalledWith(CHAT_DRAFT_STORAGE_KEY, 'onboarding.flow.meetAstra.importPrompt')
    expect(pushMock).toHaveBeenCalledWith('/chat')
    setItem.mockRestore()
  })
})

describe('onboarding actions context provider', () => {
  const actions = { finishOnboarding: vi.fn() } as unknown as OnboardingActions

  it('throws when a consumer is used outside the provider', () => {
    expect(() => renderHook(() => useOnboardingActions())).toThrow(
      'useOnboardingActions must be used within an OnboardingActionsProvider',
    )
  })

  it('exposes the actions, pro access, and live flags to consumers', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <OnboardingActionsProvider actions={actions} hasProAccess isLive={false}>
        {children}
      </OnboardingActionsProvider>
    )
    const { result } = renderHook(
      () => ({
        actions: useOnboardingActions(),
        hasPro: useOnboardingHasProAccess(),
        isLive: useOnboardingIsLive(),
      }),
      { wrapper },
    )
    expect(result.current.actions).toBe(actions)
    expect(result.current.hasPro).toBe(true)
    expect(result.current.isLive).toBe(false)
  })
})
