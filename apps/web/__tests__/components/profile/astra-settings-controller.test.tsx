import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { habitKeys } from '@orbit/shared/query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAstraSettingsController } from '@/components/profile/astra-settings-controller'

const mocks = vi.hoisted(() => ({
  updateAiSummary: vi.fn(),
  updateProactiveAstra: vi.fn(),
}))

vi.mock('@/app/actions/profile', () => ({
  updateAiSummary: mocks.updateAiSummary,
  updateProactiveAstra: mocks.updateProactiveAstra,
}))

describe('useAstraSettingsController', () => {
  beforeEach(() => {
    mocks.updateAiSummary.mockReset()
    mocks.updateProactiveAstra.mockReset()
  })

  it('owns optimistic updates, rollback, pending state, and summary invalidation', async () => {
    let rejectSummary!: (error: Error) => void
    mocks.updateAiSummary.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSummary = reject
      }),
    )
    const profile = createMockProfile({
      aiSummaryEnabled: false,
      proactiveAstraEnabled: false,
    })
    const patchProfile = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => useAstraSettingsController(profile, patchProfile),
      { wrapper },
    )

    act(() => result.current.onToggleSummary())

    expect(patchProfile).toHaveBeenCalledWith({ aiSummaryEnabled: true })
    await waitFor(() => expect(result.current.summaryPending).toBe(true))

    rejectSummary(new Error('offline'))

    await waitFor(() => {
      expect(patchProfile).toHaveBeenLastCalledWith({ aiSummaryEnabled: false })
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
  })
})
