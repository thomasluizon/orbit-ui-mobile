import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const applyOnboardingMock = vi.fn()
const patchProfileMock = vi.fn()
const captureExceptionMock = vi.fn()
const subscribePushMock = vi.fn()
const profileState = { hasCompletedOnboarding: false }

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showPersistentError: vi.fn() }),
}))

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
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

async function seedPendingDraft() {
  await useOnboardingDraftStore.persist.rehydrate()
  useOnboardingDraftStore.getState().reset()
  useOnboardingDraftStore.getState().setAccountScope(getHeldAccountId(), true)
  useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
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
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    applyOnboardingMock.mockReset()
    patchProfileMock.mockReset()
    captureExceptionMock.mockReset()
    subscribePushMock.mockReset()
    profileState.hasCompletedOnboarding = false
  })

  it('drops a completed apply after account replacement and allows the new account to flush', async () => {
    installPushEnvironment()
    holdAccount('user-1')
    let finishApply!: (value: { applied: boolean }) => void
    applyOnboardingMock.mockReturnValueOnce(new Promise((resolve) => { finishApply = resolve }))
    applyOnboardingMock.mockResolvedValue({ applied: true })
    await seedPendingDraft()
    useOnboardingDraftStore.setState({ pushPermissionGranted: true })
    const rendered = renderHook(() => useOnboardingFlush(), { wrapper })
    expect(applyOnboardingMock).toHaveBeenCalledTimes(1)

    await replaceAccountWith('user-2')
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Walk', frequencyUnit: 'Day', frequencyQuantity: 1 })
    useOnboardingDraftStore.setState({ pushPermissionGranted: true })
    await act(async () => { finishApply({ applied: true }); await Promise.resolve() })

    expect(subscribePushMock).not.toHaveBeenCalled()
    expect(patchProfileMock).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().habits[0]?.title).toBe('Walk')

    rendered.rerender()
    await waitFor(() => expect(applyOnboardingMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(patchProfileMock).toHaveBeenCalledTimes(1))
  })

  it('drops a completed apply when the same account enters a new session', async () => {
    holdAccount('user-1')
    let finishApply!: (value: { applied: boolean }) => void
    applyOnboardingMock.mockReturnValue(new Promise((resolve) => { finishApply = resolve }))
    await seedPendingDraft()
    renderHook(() => useOnboardingFlush(), { wrapper })

    await recoverSameAccount('user-1')
    await seedPendingDraft()
    await act(async () => { finishApply({ applied: true }); await Promise.resolve() })

    expect(patchProfileMock).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
  })

  it('keeps the new account draft when registration finishes after replacement', async () => {
    installPushEnvironment()
    let finishRegistration!: () => void
    subscribePushMock.mockReturnValue(new Promise<void>((resolve) => { finishRegistration = resolve }))
    applyOnboardingMock.mockResolvedValue({ applied: true })
    await seedPendingDraft()
    useOnboardingDraftStore.setState({ pushPermissionGranted: true })
    renderHook(() => useOnboardingFlush(), { wrapper })
    await waitFor(() => expect(subscribePushMock).toHaveBeenCalledTimes(1))

    await replaceAccountWith('user-2')
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Walk', frequencyUnit: 'Day', frequencyQuantity: 1 })
    await act(async () => { finishRegistration(); await Promise.resolve() })

    expect(patchProfileMock).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().habits[0]?.title).toBe('Walk')
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
    await waitFor(() => expect(patchProfileMock).toHaveBeenCalledWith({ hasCompletedOnboarding: true }))
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(false)
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
