import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { goalKeys } from '@orbit/shared/query'

import { useGoals, useGoalDetail, useGoalMetrics } from '@/hooks/use-goal-queries'

const TestRenderer = require('react-test-renderer')

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => unknown
  enabled?: boolean
  select?: (data: unknown) => unknown
}

const mocks = vi.hoisted(() => {
  return {
    captured: [] as CapturedQuery[],
    apiClient: vi.fn(),
    useQuery: vi.fn((options: CapturedQuery) => {
      mocks.captured.push(options)
      return { data: undefined, isLoading: false, isSuccess: false, isError: false }
    }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

function renderHookCapture(useHook: () => unknown): void {
  function Probe() {
    useHook()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
}

function lastQuery(): CapturedQuery {
  const query = mocks.captured.at(-1)
  if (!query) throw new Error('no query captured')
  return query
}

beforeEach(() => {
  mocks.captured = []
  mocks.apiClient.mockReset()
  mocks.useQuery.mockClear()
})

describe('useGoals (mobile query hook)', () => {
  it('keys the query on the filters and defaults to a large page size', async () => {
    mocks.apiClient.mockResolvedValue({ items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 1 })

    renderHookCapture(() => useGoals())

    const query = lastQuery()
    expect(query.queryKey).toEqual(goalKeys.list({}))

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/goals?pageSize=100')
  })

  it('passes the status filter to the query key and the request', async () => {
    mocks.apiClient.mockResolvedValue({ items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 1 })

    renderHookCapture(() => useGoals('Active'))

    const query = lastQuery()
    expect(query.queryKey).toEqual(goalKeys.list({ status: 'Active' }))

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/goals?pageSize=100&status=Active')
  })

  it('omits the status param when no filter is provided', async () => {
    mocks.apiClient.mockResolvedValue({ items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 1 })

    renderHookCapture(() => useGoals())

    await lastQuery().queryFn()
    const calledUrl = mocks.apiClient.mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('status=')
  })
})

describe('useGoalDetail (mobile)', () => {
  it('fetches goal detail from the detail endpoint when id is provided', async () => {
    mocks.apiClient.mockResolvedValue({ goal: { id: 'g-1' }, metrics: {} })

    renderHookCapture(() => useGoalDetail('g-1'))
    const query = lastQuery()

    expect(query.queryKey).toEqual(goalKeys.detail('g-1'))
    expect(query.enabled).toBe(true)

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/goals/g-1/detail')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useGoalDetail(null))
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useGoalMetrics (mobile)', () => {
  it('fetches metrics from the metrics endpoint when id is provided', async () => {
    mocks.apiClient.mockResolvedValue({
      progressPercentage: 25,
      velocityPerDay: 0.4,
      projectedCompletionDate: null,
      daysToDeadline: null,
      trackingStatus: 'OnTrack',
      habitAdherence: [],
    })

    renderHookCapture(() => useGoalMetrics('g-1'))
    const query = lastQuery()

    expect(query.queryKey).toEqual(goalKeys.metrics('g-1'))

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/goals/g-1/metrics')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useGoalMetrics(null))
    expect(lastQuery().enabled).toBe(false)
  })
})
