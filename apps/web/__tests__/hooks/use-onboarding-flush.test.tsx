import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const applyOnboardingMock = vi.fn()
const patchProfileMock = vi.fn()

vi.mock('@/app/actions/onboarding', () => ({
  applyOnboarding: (...args: unknown[]) => applyOnboardingMock(...args),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ patchProfile: patchProfileMock }),
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
    applyOnboardingMock.mockReset()
    patchProfileMock.mockReset()
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

  it('retains the draft and does not mark onboarded on failure', async () => {
    applyOnboardingMock.mockRejectedValue(new Error('network'))
    await seedPendingDraft()

    renderHook(() => useOnboardingFlush(), { wrapper })

    await waitFor(() => expect(applyOnboardingMock).toHaveBeenCalledTimes(1))
    expect(useOnboardingDraftStore.getState().hasPendingAnswers()).toBe(true)
    expect(patchProfileMock).not.toHaveBeenCalled()
  })
})
