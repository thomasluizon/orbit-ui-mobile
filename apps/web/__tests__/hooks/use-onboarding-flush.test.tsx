import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const applyOnboardingMock = vi.fn()
const patchProfileMock = vi.fn()
const captureExceptionMock = vi.fn()
const subscribePushMock = vi.fn()
const profileState = { hasCompletedOnboarding: false }

vi.mock('@/lib/actions/onboarding', () => ({
  applyOnboarding: (...args: unknown[]) => applyOnboardingMock(...args),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileState, patchProfile: patchProfileMock }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

vi.mock('@/lib/actions/notifications', () => ({
  subscribePush: (...args: unknown[]) => subscribePushMock(...args),
  unsubscribePush: vi.fn(),
}))

import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { requestWebPushPermission } from '@/hooks/use-push-notification-preferences'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getHeldAccountId } from '@/stores/auth-store'

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

async function seedPendingDraft() {
  useOnboardingDraftStore.getState().reset()
  useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
  await useOnboardingDraftStore.persist.rehydrate()
}

function installPushEnvironment() {
  const requestPermission = vi.fn(() => Promise.resolve('granted' as const))
  Object.defineProperty(globalThis, 'Notification', { configurable: true, value: { permission: 'default', requestPermission } })
  Object.defineProperty(globalThis, 'PushManager', { configurable: true, value: class PushManager {} })
  const subscription = { toJSON: () => ({ endpoint: 'https://push.example/subscription' }), unsubscribe: vi.fn() }
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn(() => null), subscribe: vi.fn(() => subscription) } }) },
  })
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'AQ'
}

describe('useOnboardingFlush', () => {
  beforeEach(() => {
    applyOnboardingMock.mockReset()
    patchProfileMock.mockReset()
    captureExceptionMock.mockReset()
    subscribePushMock.mockReset()
    profileState.hasCompletedOnboarding = false
  })

  it('registers a signed-out permission grant after authentication flushes onboarding', async () => {
    installPushEnvironment()
    applyOnboardingMock.mockResolvedValue({ applied: true, createdHabitCount: 1, createdGoal: false, loggedFirstHabit: false })
    await seedPendingDraft()

    const outcome = await requestWebPushPermission()
    expect(outcome).toBe('granted')
    useOnboardingDraftStore.setState({ pushPermissionGranted: true })
    renderHook(() => useOnboardingFlush(), { wrapper })

    await waitFor(() => expect(subscribePushMock).toHaveBeenCalledWith({ endpoint: 'https://push.example/subscription' }, getHeldAccountId()))
  })

  it('retains the draft and exposes deferred registration failure', async () => {
    installPushEnvironment()
    applyOnboardingMock.mockResolvedValue({ applied: true, createdHabitCount: 1, createdGoal: false, loggedFirstHabit: false })
    subscribePushMock.mockRejectedValue(new Error('backend unavailable'))
    await seedPendingDraft()
    useOnboardingDraftStore.setState({ pushPermissionGranted: true })

    renderHook(() => useOnboardingFlush(), { wrapper })

    await waitFor(() => expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(true))
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
    expect(patchProfileMock).not.toHaveBeenCalled()
  })

  it('applies buffered answers, clears the draft, and marks onboarded on success', async () => {
    applyOnboardingMock.mockResolvedValue({
      applied: true,
      createdHabitCount: 1,
      createdGoal: false,
      loggedFirstHabit: false,
    })
    await seedPendingDraft()

    renderHook(() => useOnboardingFlush(), { wrapper })

    await waitFor(() => expect(applyOnboardingMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false),
    )
    expect(patchProfileMock).toHaveBeenCalledWith({ hasCompletedOnboarding: true })
  })

  it('retains the draft, does not mark onboarded, and reports the error on failure', async () => {
    applyOnboardingMock.mockRejectedValue(new Error('network'))
    await seedPendingDraft()

    renderHook(() => useOnboardingFlush(), { wrapper })

    await waitFor(() => expect(applyOnboardingMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledTimes(1))
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
    expect(patchProfileMock).not.toHaveBeenCalled()
  })

  it('does not flush when the account has already completed onboarding', async () => {
    profileState.hasCompletedOnboarding = true
    applyOnboardingMock.mockResolvedValue({
      applied: true,
      createdHabitCount: 1,
      createdGoal: false,
      loggedFirstHabit: false,
    })
    await seedPendingDraft()

    renderHook(() => useOnboardingFlush(), { wrapper })

    await Promise.resolve()
    expect(applyOnboardingMock).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
  })
})
