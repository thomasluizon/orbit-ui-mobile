import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const applyOnboardingMock = vi.fn()
const patchProfileMock = vi.fn()
const captureExceptionMock = vi.fn()
const profileState = { hasCompletedOnboarding: false }
const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  getAccountGeneration: () => account.generation,
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

import { useOnboardingFlush } from '@/hooks/use-onboarding-flush'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

async function seedPendingDraft() {
  useOnboardingDraftStore.getState().reset()
  useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
  await useOnboardingDraftStore.persist.rehydrate()
}

describe('useOnboardingFlush', () => {
  beforeEach(() => {
    account.id = 'account-a'
    account.generation = 1
    applyOnboardingMock.mockReset()
    patchProfileMock.mockReset()
    captureExceptionMock.mockReset()
    profileState.hasCompletedOnboarding = false
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

  it('does not apply a completed flush to the next account state', async () => {
    let finishFlush: () => void = () => {}
    applyOnboardingMock.mockReturnValue(new Promise<void>((resolve) => { finishFlush = resolve }))
    await seedPendingDraft()
    renderHook(() => useOnboardingFlush(), { wrapper })
    await waitFor(() => expect(applyOnboardingMock).toHaveBeenCalledTimes(1))

    account.id = 'account-b'
    account.generation++
    await act(async () => { finishFlush(); await Promise.resolve() })

    expect(patchProfileMock).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
  })
})
