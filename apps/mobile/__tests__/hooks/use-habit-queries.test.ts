import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, HABITS_REFETCH_INTERVAL } from '@orbit/shared/query'

import {
  useHabits,
  useHabitDetail,
  useHabitMetrics,
  useHabitLogs,
  useHabitFullDetail,
  useTotalHabitCount,
  useHabitCountLoaded,
} from '@/hooks/use-habit-queries'

const TestRenderer = require('react-test-renderer')

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => unknown
  enabled?: boolean
  refetchInterval?: () => number | false
  select?: (data: unknown) => unknown
}

const mocks = vi.hoisted(() => {
  return {
    captured: [] as CapturedQuery[],
    apiClient: vi.fn(),
    isAppActive: vi.fn(() => true),
    isOnline: vi.fn(() => true),
    isAuthenticated: true,
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

vi.mock('@/lib/query-client', () => ({
  isAppActive: () => mocks.isAppActive(),
  isOnline: () => mocks.isOnline(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mocks.isAuthenticated }),
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
  mocks.isAppActive.mockReturnValue(true)
  mocks.isOnline.mockReturnValue(true)
  mocks.isAuthenticated = true
})

describe('useHabits (mobile query hook)', () => {
  it('keys the query on the filters and defaults to a large page size', async () => {
    mocks.apiClient.mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })

    renderHookCapture(() => useHabits({}))

    const query = lastQuery()
    expect(query.queryKey).toEqual(habitKeys.list({}))

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits?pageSize=200')
  })

  it('does not override the page size for date-bounded single-day queries', async () => {
    mocks.apiClient.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 1 })

    renderHookCapture(() => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }))

    await lastQuery().queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits?dateFrom=2025-01-01&dateTo=2025-01-01')
  })
})

describe('useHabits refetch gating (single-day / midnight rollover)', () => {
  it('polls single-day queries while active and online', () => {
    renderHookCapture(() => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }))
    expect(lastQuery().refetchInterval?.()).toBe(HABITS_REFETCH_INTERVAL)
  })

  it('does not poll multi-day (calendar-range) queries', () => {
    renderHookCapture(() => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-31' }))
    expect(lastQuery().refetchInterval?.()).toBe(false)
  })

  it('does not poll list queries with no date range', () => {
    renderHookCapture(() => useHabits({}))
    expect(lastQuery().refetchInterval?.()).toBe(false)
  })

  it('pauses polling when the app is offline', () => {
    mocks.isOnline.mockReturnValue(false)
    renderHookCapture(() => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }))
    expect(lastQuery().refetchInterval?.()).toBe(false)
  })

  it('pauses polling when the app is backgrounded', () => {
    mocks.isAppActive.mockReturnValue(false)
    renderHookCapture(() => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }))
    expect(lastQuery().refetchInterval?.()).toBe(false)
  })
})

describe('useHabitDetail (mobile)', () => {
  it('fetches habit detail when id is provided', async () => {
    mocks.apiClient.mockResolvedValue({ id: 'h-1', title: 'Exercise' })

    renderHookCapture(() => useHabitDetail('h-1'))
    const query = lastQuery()

    expect(query.queryKey).toEqual(habitKeys.detail('h-1'))
    expect(query.enabled).toBe(true)

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/h-1')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useHabitDetail(null))
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useHabitMetrics (mobile)', () => {
  it('fetches metrics from the metrics endpoint', async () => {
    mocks.apiClient.mockResolvedValue({
      weeklyCompletionRate: 85,
      monthlyCompletionRate: 70,
      currentStreak: 5,
      longestStreak: 14,
      totalCompletions: 100,
      lastCompletedDate: null,
    })

    renderHookCapture(() => useHabitMetrics('h-1'))
    await lastQuery().queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/h-1/metrics')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useHabitMetrics(null))
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useHabitLogs (mobile)', () => {
  it('fetches logs from the logs endpoint', async () => {
    mocks.apiClient.mockResolvedValue([])

    renderHookCapture(() => useHabitLogs('h-1'))
    await lastQuery().queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/h-1/logs')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useHabitLogs(null))
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useHabitFullDetail (mobile)', () => {
  it('fetches the full detail endpoint', async () => {
    mocks.apiClient.mockResolvedValue({ habit: { id: 'h-1' }, logs: [], metrics: null })

    renderHookCapture(() => useHabitFullDetail('h-1'))
    const query = lastQuery()
    expect(query.queryKey).toEqual(habitKeys.fullDetail('h-1'))

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/h-1/detail')
  })

  it('does not enable the query when id is null', () => {
    renderHookCapture(() => useHabitFullDetail(null))
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useTotalHabitCount (mobile)', () => {
  it('reads the lightweight count endpoint when authenticated', async () => {
    mocks.apiClient.mockResolvedValue({ count: 42 })

    renderHookCapture(() => useTotalHabitCount())
    const query = lastQuery()
    expect(query.queryKey).toEqual(habitKeys.count())
    expect(query.enabled).toBe(true)

    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/habits/count')
  })

  it('does not enable the query when unauthenticated', () => {
    mocks.isAuthenticated = false

    renderHookCapture(() => useTotalHabitCount())
    expect(lastQuery().enabled).toBe(false)
  })
})

describe('useHabits pagination + accessors', () => {
  it('fetches and concatenates every page for an unbounded multi-page list', async () => {
    mocks.apiClient
      .mockResolvedValueOnce({ items: [{ id: 'a' }], page: 1, pageSize: 200, totalCount: 2, totalPages: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], page: 2, pageSize: 200, totalCount: 2, totalPages: 2 })

    renderHookCapture(() => useHabits({}))
    const items = (await lastQuery().queryFn()) as Array<{ id: string }>

    expect(items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
  })

  it('returns an empty child list before habit data has loaded', () => {
    let api: ReturnType<typeof useHabits> | null = null
    function Probe() {
      api = useHabits({})
      return null
    }
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(Probe))
    })
    expect(api!.getChildren('missing-parent')).toEqual([])
  })
})

describe('useHabitCountLoaded (mobile)', () => {
  it('reports zero and not-loaded until the count query settles', () => {
    let loaded: ReturnType<typeof useHabitCountLoaded> | null = null
    function Probe() {
      loaded = useHabitCountLoaded()
      return null
    }
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(Probe))
    })
    expect(loaded).toEqual({ count: 0, isLoaded: false })
  })
})
