import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { useReportEvent } from '@/hooks/use-gamification'
const TestRenderer = require('react-test-renderer')

interface MutationOptions {
  mutationFn: (variables: string) => Promise<{ granted: { id: string; xpReward: number }[] }>
  onSuccess?: (
    result: { granted: { id: string; xpReward: number }[] },
    variables: string,
    context: unknown,
  ) => void | Promise<void>
}

const mocks = vi.hoisted(() => {
  const enqueueCelebration = vi.fn()
  const invalidateQueries = vi.fn(async () => {})
  return {
    enqueueCelebration,
    invalidateQueries,
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
  useMutation: (options: MutationOptions) => ({
    mutate: async (variables: string) => {
      const result = await options.mutationFn(variables)
      await options.onSuccess?.(result, variables, undefined)
    },
  }),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (
    selector: (state: { enqueueCelebration: typeof mocks.enqueueCelebration }) => unknown,
  ) => selector({ enqueueCelebration: mocks.enqueueCelebration }),
}))

async function callHook<T>(hook: () => T): Promise<T> {
  let value: T | null = null
  function Harness() {
    value = hook()
    return null
  }
  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })
  if (!value) throw new Error('hook did not render')
  return value
}

describe('mobile useReportEvent', () => {
  beforeEach(() => {
    mocks.enqueueCelebration.mockClear()
    mocks.invalidateQueries.mockClear()
    mocks.apiClient.mockReset()
  })

  it('posts the event key and celebrates each granted achievement on success', async () => {
    mocks.apiClient.mockResolvedValue({
      granted: [{ id: 'show_off', xpReward: 75 }],
    })

    const mutation = await callHook(() => useReportEvent())
    await mutation.mutate('card_shared')

    expect(mocks.apiClient).toHaveBeenCalledWith(API.gamification.reportEvent, {
      method: 'POST',
      body: JSON.stringify({ eventKey: 'card_shared' }),
    })
    expect(mocks.enqueueCelebration).toHaveBeenCalledWith('achievement', {
      achievementId: 'show_off',
      xpReward: 75,
    })
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('does not celebrate when nothing was granted (idempotent)', async () => {
    mocks.apiClient.mockResolvedValue({ granted: [] })

    const mutation = await callHook(() => useReportEvent())
    await mutation.mutate('wrapped_viewed')

    expect(mocks.enqueueCelebration).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })
})
