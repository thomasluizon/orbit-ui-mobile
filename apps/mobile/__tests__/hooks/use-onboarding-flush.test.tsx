import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const draftState = {
    _hasHydrated: true,
    pending: true,
    pushPermissionGranted: false,
    pushRegistrationFailed: false,
    reset: vi.fn(),
    markPushRegistrationFailed: vi.fn(),
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
    profile: { hasCompletedOnboarding: false },
    captureError: vi.fn(),
    requestPermissionOutcome: vi.fn(() => Promise.resolve('granted')),
    applyOnboarding: vi.fn(() => Promise.resolve({
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
  return {
    useOnboardingDraftStore: store,
    useOnboardingDraftHydrated: () => mocks.draftState._hasHydrated,
  }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))

vi.mock('@/lib/sentry', () => ({
  captureError: mocks.captureError,
}))

vi.mock('@/hooks/use-apply-onboarding', () => ({
  useApplyOnboarding: () => mocks.applyOnboarding,
}))

vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({ requestPermissionOutcome: mocks.requestPermissionOutcome }),
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
    mocks.draftState.pushPermissionGranted = false
    mocks.draftState.pushRegistrationFailed = false
    mocks.profile.hasCompletedOnboarding = false
    mocks.captureError.mockClear()
    mocks.draftState.reset.mockClear()
    mocks.draftState.markPushRegistrationFailed.mockClear()
    mocks.requestPermissionOutcome.mockClear()
    mocks.requestPermissionOutcome.mockResolvedValue('granted')
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

  it('registers a deferred signed-out permission before clearing the draft', async () => {
    mocks.draftState.pushPermissionGranted = true

    await renderFlush()

    expect(mocks.requestPermissionOutcome).toHaveBeenCalledWith(true)
    expect(mocks.draftState.reset).toHaveBeenCalledTimes(1)
  })

  it('finishes after the push provider rerenders during deferred registration', async () => {
    mocks.draftState.pushPermissionGranted = true
    let resolvePermission!: (outcome: 'granted') => void
    mocks.requestPermissionOutcome.mockReturnValue(new Promise((resolve) => { resolvePermission = resolve }))

    function Harness({ providerVersion }: Readonly<{ providerVersion: number }>) {
      useOnboardingFlush()
      return React.createElement('ProviderVersion', { providerVersion })
    }

    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Harness providerVersion={1} />)
      await Promise.resolve()
    })
    expect(mocks.requestPermissionOutcome).toHaveBeenCalledWith(true)
    mocks.draftState.reset.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()

    await TestRenderer.act(async () => {
      tree.update(<Harness providerVersion={2} />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      resolvePermission('granted')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.draftState.reset).toHaveBeenCalledTimes(1)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(4)
  })

  it('retains the draft and marks a deferred registration failure', async () => {
    mocks.draftState.pushPermissionGranted = true
    mocks.requestPermissionOutcome.mockResolvedValue('failed')

    await renderFlush()

    expect(mocks.draftState.markPushRegistrationFailed).toHaveBeenCalledTimes(1)
    expect(mocks.draftState.reset).not.toHaveBeenCalled()
  })

  it('retains the draft and reports the error when the apply fails', async () => {
    mocks.applyOnboarding.mockRejectedValueOnce(new Error('network'))

    await renderFlush()

    expect(mocks.applyOnboarding).toHaveBeenCalledTimes(1)
    expect(mocks.draftState.reset).not.toHaveBeenCalled()
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.captureError).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the account has already completed onboarding', async () => {
    mocks.profile.hasCompletedOnboarding = true

    await renderFlush()

    expect(mocks.applyOnboarding).not.toHaveBeenCalled()
    expect(mocks.draftState.reset).not.toHaveBeenCalled()
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
