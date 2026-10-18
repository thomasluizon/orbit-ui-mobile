import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { logHabitResponseSchema } from '@orbit/shared/types/habit'
import { goalDetailWithMetricsSchema } from '@orbit/shared/types/goal'
import { useLogHabit } from '@/hooks/use-habits'

import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({
  isQueuedResult: (response: unknown) => typeof response === 'object' && response !== null && 'queued' in response,
}))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn(async () => {}) }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
}))
vi.mock('@/lib/posthog', () => ({ captureHabitLogged: vi.fn() }))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

async function mountMutation(queryClient: QueryClient) {
  let mutation: ReturnType<typeof useLogHabit>
  function Consumer() {
    mutation = useLogHabit()
    return null
  }
  let renderer: { unmount: () => void }
  await TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Consumer)),
    )
  })
  return {
    run: () => TestRenderer.act(async () => { await mutation.mutateAsync({ habitId: 'habit-1' }) }),
    unmount: async () => { await TestRenderer.act(() => renderer.unmount()) },
  }
}

const respond = (response: unknown) => vi.mocked(performQueuedApiMutation).mockResolvedValue(
  logHabitResponseSchema.parse(response),
)
const reject = (error: Error) => vi.mocked(performQueuedApiMutation).mockRejectedValue(error)

function seedGoals(queryClient: QueryClient) {
  const goals = ['goal-1', 'goal-2', 'unrelated'].map((id) => createMockGoal({ id }))
  for (const goal of goals) {
    const detail = goalDetailWithMetricsSchema.parse({
      goal: { ...goal, progressHistory: [] },
      metrics: {
        progressPercentage: goal.progressPercentage,
        velocityPerDay: 0,
        projectedCompletionDate: null,
        daysToDeadline: null,
        trackingStatus: 'OnTrack',
        habitAdherence: [],
      },
    })
    queryClient.setQueryData(goalKeys.detail(goal.id), detail)
    queryClient.setQueryData(goalKeys.metrics(goal.id), detail.metrics)
  }
  queryClient.setQueryData(goalKeys.list({}), goals)
}

function expectGoalInvalidated(queryClient: QueryClient, goalId: string, invalidated: boolean) {
  expect(queryClient.getQueryState(goalKeys.detail(goalId))?.isInvalidated).toBe(invalidated)
  expect(queryClient.getQueryState(goalKeys.metrics(goalId))?.isInvalidated).toBe(invalidated)
}

describe('linked goal cache after habit logging', () => {
  it.each([
    { operation: 'log', logId: 'log-1', newProgress: 12, progressPercentage: 100 },
    { operation: 'unlog', logId: '', newProgress: 2, progressPercentage: 16.7 },
  ])('invalidates affected detail and metrics after $operation while keeping the list patch', async ({ logId, newProgress, progressPercentage }) => {
    respond({
      logId,
      isFirstCompletionToday: false,
      currentStreak: 0,
      linkedGoalUpdates: ['goal-1', 'goal-2'].map((goalId) => ({
        goalId, title: 'Read books', newProgress, targetValue: 12,
      })),
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: QUERY_STALE_TIMES.goals, retry: false }, mutations: { retry: false } },
    })
    seedGoals(queryClient)
    expectGoalInvalidated(queryClient, 'goal-1', false)
    const mutation = await mountMutation(queryClient)
    try {
      await mutation.run()
      expectGoalInvalidated(queryClient, 'goal-1', true)
      expectGoalInvalidated(queryClient, 'goal-2', true)
      expectGoalInvalidated(queryClient, 'unrelated', false)
      expect(queryClient.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(true)
      expect(queryClient.getQueryData(goalKeys.list({}))).toEqual([
        expect.objectContaining({ id: 'goal-1', currentValue: newProgress, progressPercentage }),
        expect.objectContaining({ id: 'goal-2', currentValue: newProgress, progressPercentage }),
        createMockGoal({ id: 'unrelated' }),
      ])
    } finally {
      await mutation.unmount()
      queryClient.clear()
    }
  })

  it.each([undefined, null, []])('keeps goal caches fresh when linked updates are %s', async (linkedGoalUpdates) => {
    respond({ logId: 'log-1', isFirstCompletionToday: false, currentStreak: 0, linkedGoalUpdates })
    const queryClient = new QueryClient()
    seedGoals(queryClient)
    const mutation = await mountMutation(queryClient)
    try {
      await mutation.run()
      expectGoalInvalidated(queryClient, 'goal-1', false)
      expect(queryClient.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(false)
    } finally {
      await mutation.unmount()
      queryClient.clear()
    }
  })

  it('keeps goal caches fresh when logging fails', async () => {
    reject(new Error('Log failed'))
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    seedGoals(queryClient)
    const mutation = await mountMutation(queryClient)
    try {
      await expect(mutation.run()).rejects.toThrow('Log failed')
      expectGoalInvalidated(queryClient, 'goal-1', false)
      expect(queryClient.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(false)
    } finally {
      await mutation.unmount()
      queryClient.clear()
    }
  })
})

it('keeps goal caches fresh while a habit log is queued offline', async () => {
  vi.mocked(performQueuedApiMutation).mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })
  const queryClient = new QueryClient()
  seedGoals(queryClient)
  const mutation = await mountMutation(queryClient)
  try {
    await mutation.run()
    expectGoalInvalidated(queryClient, 'goal-1', false)
    expect(queryClient.getQueryState(goalKeys.list({}))?.isInvalidated).toBe(false)
  } finally {
    await mutation.unmount()
    queryClient.clear()
  }
})
