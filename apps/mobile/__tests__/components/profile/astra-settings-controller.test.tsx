import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAstraSettingsController } from '@/components/profile/astra-settings-controller'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  performQueuedApiMutation: vi.fn(),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

describe('useAstraSettingsController', () => {
  beforeEach(() => {
    mocks.performQueuedApiMutation.mockReset()
  })

  it('owns offline dedupe, optimistic rollback, pending state, and summary invalidation', async () => {
    let rejectSummary!: (error: Error) => void
    mocks.performQueuedApiMutation.mockReturnValue(
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
    let controller: ReturnType<typeof useAstraSettingsController> | undefined

    function Harness() {
      controller = useAstraSettingsController(profile, patchProfile)
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      )
    })
    if (!controller) throw new Error('Astra settings controller did not render')

    TestRenderer.act(() => controller?.onToggleSummary())
    await TestRenderer.act(async () => {
      await Promise.resolve()
    })

    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith({
      type: 'setAiSummary',
      scope: 'profile',
      endpoint: API.profile.aiSummary,
      method: 'PUT',
      payload: { enabled: true },
      dedupeKey: 'profile-ai-summary',
    })
    expect(patchProfile).toHaveBeenCalledWith({ aiSummaryEnabled: true })
    expect(controller.summaryPending).toBe(true)

    rejectSummary(new Error('offline'))
    await TestRenderer.act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(patchProfile).toHaveBeenLastCalledWith({ aiSummaryEnabled: false })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
  })
})
