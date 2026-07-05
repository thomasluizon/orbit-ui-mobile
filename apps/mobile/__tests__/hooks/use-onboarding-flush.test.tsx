import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const draftState = {
    _hasHydrated: true,
    pending: true,
    reset: vi.fn(),
    hasPendingAnswers() {
      return this.pending
    },
  }

  const queryClient = {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }

  return {
    authState: { isAuthenticated: true },
    draftState,
    queryClient,
    applyOnboarding: vi.fn(async () => ({
      applied: true,
      createdHabitCount: 1,
      createdGoal: false,
      loggedFirstHabit: false,
    })),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector(mocks.authState),
}))

vi.mock('@/stores/onboarding-draft-store', () => {
  const store = (selector: (state: typeof mocks.draftState) => unknown) =>
    selector(mocks.draftState)
  store.getState = () => mocks.draftState
  return { useOnboardingDraftStore: store }
})

vi.mock('@/hooks/use-apply-onboarding', () => ({
  useApplyOnboarding: () => mocks.applyOnboarding,
}))

async function renderFlush() {
  function Harness() {
    useOnboardingFlush()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useOnboardingFlush', () => {
  beforeEach(() => {
    mocks.authState.isAuthenticated = true
    mocks.draftState._hasHydrated = true
    mocks.draftState.pending = true
    mocks.draftState.reset.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.applyOnboarding.mockClear()
    mocks.applyOnboarding.mockResolvedValue({
      applied: true,
      createdHabitCount: 1,
      createdGoal: false,
      loggedFirstHabit: false,
    })
  })

  it('applies, clears the draft, and marks the profile onboarded on a 2xx', async () => {
    await renderFlush()

    expect(mocks.applyOnboarding).toHaveBeenCalledTimes(1)
    expect(mocks.draftState.reset).toHaveBeenCalledTimes(1)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(4)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: gamificationKeys.all,
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })

    const call = mocks.queryClient.setQueryData.mock.calls[0]
    if (!call) throw new Error('expected setQueryData to be called')
    const updater = call[1] as (old: Profile | undefined) => Profile | undefined
    const patched = updater({ hasCompletedOnboarding: false } as Profile)
    expect(patched?.hasCompletedOnboarding).toBe(true)
  })

  it('retains the draft when the apply fails', async () => {
    mocks.applyOnboarding.mockRejectedValueOnce(new Error('network'))

    await renderFlush()

    expect(mocks.applyOnboarding).toHaveBeenCalledTimes(1)
    expect(mocks.draftState.reset).not.toHaveBeenCalled()
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
  })

  it('does nothing when there are no pending answers', async () => {
    mocks.draftState.pending = false

    await renderFlush()

    expect(mocks.applyOnboarding).not.toHaveBeenCalled()
    expect(mocks.draftState.reset).not.toHaveBeenCalled()
  })

  it('does nothing before hydration completes', async () => {
    mocks.draftState._hasHydrated = false

    await renderFlush()

    expect(mocks.applyOnboarding).not.toHaveBeenCalled()
  })
})
