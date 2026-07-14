import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, goalKeys, tagKeys, gamificationKeys } from '@orbit/shared/query'
import type { StreakInfo } from '@orbit/shared/types'
import { useTourMockData } from '@/hooks/use-tour-mock-data'

const TestRenderer = require('react-test-renderer')

interface FakeQueryClient {
  setQueryDefaults: ReturnType<typeof vi.fn>
  setQueriesData: ReturnType<typeof vi.fn>
  setQueryData: ReturnType<typeof vi.fn>
  invalidateQueries: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => {
  const queryClient = {
    setQueryDefaults: vi.fn(),
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }
  return { queryClient }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

function renderTourMockData(): { inject: () => void; restore: () => void } {
  let api: { inject: () => void; restore: () => void } | null = null
  function Harness() {
    api = useTourMockData()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  if (!api) throw new Error('hook did not return')
  return api
}

function findSetQueryDataCall(
  client: FakeQueryClient,
  key: readonly unknown[],
): unknown[] | undefined {
  return client.setQueryData.mock.calls.find(
    (call) => JSON.stringify(call[0]) === JSON.stringify(key),
  )
}

describe('mobile useTourMockData', () => {
  beforeEach(() => {
    mocks.queryClient.setQueryDefaults.mockClear()
    mocks.queryClient.setQueriesData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
  })

  it('freezes the list caches so the tour data is never refetched', () => {
    renderTourMockData().inject()

    expect(mocks.queryClient.setQueryDefaults).toHaveBeenCalledWith(habitKeys.lists(), {
      staleTime: Infinity,
      refetchInterval: false,
    })
    expect(mocks.queryClient.setQueryDefaults).toHaveBeenCalledWith(goalKeys.lists(), {
      staleTime: Infinity,
    })
    expect(mocks.queryClient.setQueryDefaults).toHaveBeenCalledWith(tagKeys.lists(), {
      staleTime: Infinity,
    })
  })

  it('seeds translated mock habits into the list caches', () => {
    renderTourMockData().inject()

    const listCall = mocks.queryClient.setQueriesData.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ queryKey: habitKeys.lists() }),
    )
    expect(listCall).toBeDefined()
    const updater = listCall?.[1] as () => Array<{ id: string }>
    const habits = updater()
    expect(habits.length).toBeGreaterThan(0)
    expect(habits[0]?.id).toBe('tour-habit-1')
  })

  it('seeds translated mock goals into the list caches', () => {
    renderTourMockData().inject()

    const goalCall = mocks.queryClient.setQueriesData.mock.calls.find(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ queryKey: goalKeys.lists() }),
    )
    expect(goalCall).toBeDefined()
    const updater = goalCall?.[1] as () => Array<{ id: string }>
    const goals = updater()
    expect(goals.length).toBeGreaterThan(0)
  })

  it('seeds a fresh streak of 1 only when the user has no active streak', () => {
    renderTourMockData().inject()

    const streakCall = findSetQueryDataCall(mocks.queryClient, gamificationKeys.streak())
    expect(streakCall).toBeDefined()
    const updater = streakCall?.[1] as (old: StreakInfo | undefined) => StreakInfo

    const seeded = updater(undefined)
    expect(seeded.currentStreak).toBe(1)
    expect(seeded.freezesAvailable).toBe(2)
  })

  it('keeps a real streak untouched when the user already has one', () => {
    renderTourMockData().inject()

    const streakCall = findSetQueryDataCall(mocks.queryClient, gamificationKeys.streak())
    const updater = streakCall?.[1] as (old: StreakInfo | undefined) => StreakInfo

    const existing = { currentStreak: 12, longestStreak: 20 } as StreakInfo
    expect(updater(existing)).toBe(existing)
  })

  it('restore clears the frozen defaults and invalidates every tour cache', () => {
    renderTourMockData().restore()

    expect(mocks.queryClient.setQueryDefaults).toHaveBeenCalledWith(habitKeys.lists(), {
      staleTime: undefined,
      refetchInterval: undefined,
    })
    expect(mocks.queryClient.setQueryDefaults).toHaveBeenCalledWith(gamificationKeys.all, {
      staleTime: undefined,
    })

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: tagKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: gamificationKeys.all,
    })
  })
})
