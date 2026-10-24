import { createMoveInventoryFixture } from '@orbit/shared/__tests__/move-inventory-fixtures'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { resetAccountQueries } from '@orbit/shared/query'
import reminderWire from '@orbit/shared/test-support/fixtures/habit-reminder-wire.json'
import { createHabitViewItems, createHabitViewScheduleItems } from '@orbit/shared/__tests__/habit-view-fixtures'
import { buildHabitDateBuckets, canLogHabitOnDate } from '@orbit/shared/utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import {
  useHabits,
  useHabitDetail,
  useHabitMetrics,
  useHabitLogs,
  useHabitFullDetail,
  useTotalHabitCount,
  useSearchHabits,
} from '@/hooks/use-habit-queries'
import type {
  HabitScheduleItem,
  HabitDetail,
  HabitFullDetail,
  HabitMetrics,
  PaginatedResponse,
} from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'

const validMetrics = {
  weeklyCompletionRate: 85,
  monthlyCompletionRate: 70,
  currentStreak: 5,
  longestStreak: 14,
  totalCompletions: 100,
  lastCompletedDate: null,
}
const validDetail = { ...createMockHabit({ id: 'h-1' }), children: [] }
const validLogs = [{ id: 'log-1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T10:00:00Z' }]
const validFullDetail = { habit: validDetail, metrics: validMetrics, logs: validLogs }
const invalidMetricsBodies = [
  { label: 'empty body', body: {} },
  ...Object.keys(validMetrics).map((field) => ({
    label: `missing ${field}`,
    body: Object.fromEntries(Object.entries(validMetrics).filter(([key]) => key !== field)),
  })),
  { label: 'wrong completion rate type', body: { ...validMetrics, monthlyCompletionRate: '70' } },
]

const mockFetch = vi.fn()
const mockConfirmSessionRefreshFailure = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const mockRecoverSessionRefreshFailure = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/stores/auth-store', { spy: true })

function makeScheduleItem(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'h-1',
    title: 'Exercise',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    scheduledDates: ['2025-01-01'],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    children: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    linkedGoals: [],
    instances: [],
    ...overrides,
  }
}

function makePaginatedResponse(items: HabitScheduleItem[]): PaginatedResponse<HabitScheduleItem> {
  return {
    items,
    page: 1,
    pageSize: 50,
    totalCount: items.length,
    totalPages: 1,
  }
}

let queryClient: QueryClient

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(async () => {
  mockConfirmSessionRefreshFailure.mockClear()
  mockRecoverSessionRefreshFailure.mockClear()
  const { useAuthStore } = await import('@/stores/auth-store')
  const initialState = useAuthStore.getInitialState()
  vi.spyOn(useAuthStore, 'getState').mockReturnValue({
    ...initialState,
    confirmSessionRefreshFailure: mockConfirmSessionRefreshFailure,
    recoverSessionRefreshFailure: mockRecoverSessionRefreshFailure,
  })
})

afterEach(async () => {
  cleanup()
  queryClient.clear()
  const { useAuthStore } = await import('@/stores/auth-store')
  vi.mocked(useAuthStore.getState).mockRestore()
})

describe('useHabits (query hook)', () => {
  it.each([false, true])('loads every unfiltered inventory page, General=%s', async (isGeneral) => {
    const fixture = createMoveInventoryFixture('2026-09-12')
    mockFetch.mockImplementation(async (url: string) => Response.json(fixture.response(url)))
    const { result } = renderHook(() => useHabits(isGeneral ? { isGeneral: true } : {}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const expected = isGeneral ? ['general-one', 'general-two', 'general-child']
      : fixture.optionIds.filter((id): id is string => id !== null && !id.startsWith('general')).concat(['finished', 'finished-child'])
    expect(new Set(result.current.data!.habitsById.keys())).toEqual(new Set(expected))
    const urls = mockFetch.mock.calls.map(([url]) => String(url))
    expect(urls).toEqual(isGeneral
      ? ['/api/habits?isGeneral=true&pageSize=200', '/api/habits?isGeneral=true&page=2&pageSize=200']
      : ['/api/habits?pageSize=200', '/api/habits?page=2&pageSize=200'])
  })

  it.each([false, true])('never publishes a first inventory page after a later failure, General=%s', async (isGeneral) => {
    const fixture = createMoveInventoryFixture('2026-09-12')
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('page=2')) throw new Error('page unavailable')
      return Response.json(fixture.response(url))
    })
    const { result } = renderHook(() => useHabits(isGeneral ? { isGeneral: true } : {}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error?.message).toBe('page unavailable')
  })

  it.each([
    { mode: 'signed-in', isGeneral: false, warm: false }, { mode: 'signed-out', isGeneral: false, warm: false },
    { mode: 'signed-in', isGeneral: true, warm: true }, { mode: 'signed-out', isGeneral: false, warm: true },
  ] as const)('rejects a late inventory page across actual $mode reset, General=$isGeneral warm=$warm', async ({ mode, isGeneral, warm }) => {
    const fixture = createMoveInventoryFixture('2026-09-12')
    const filters = isGeneral ? { isGeneral: true } : {}
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('page=2')) await held
      return Response.json(fixture.response(url))
    })
    const wrapper = createWrapper()
    if (warm) queryClient.setQueryData(habitKeys.list(filters), (isGeneral ? fixture.general : fixture.scheduled).flat())
    const { result, rerender } = renderHook(({ enabled }) => useHabits(filters, undefined, { enabled }), { wrapper, initialProps: { enabled: true } })
    if (warm) act(() => { void queryClient.invalidateQueries({ queryKey: habitKeys.list(filters) }) })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    rerender({ enabled: false })
    await act(async () => { advanceAccountGeneration(); await resetAccountQueries(queryClient, mode) })
    expect(queryClient.getQueryData(habitKeys.list(filters))).toBeUndefined()
    expect(queryClient.getQueryData(habitKeys.listTotalCount(filters))).toBeUndefined()
    await act(async () => { release(); await held })
    await waitFor(() => expect(result.current.data).toBeUndefined())
    expect(queryClient.getQueryData(habitKeys.list(filters))).toBeUndefined()
    expect(queryClient.getQueryData(habitKeys.listTotalCount(filters))).toBeUndefined()
    mockFetch.mockImplementation(async () => Response.json(makePaginatedResponse([createMockHabitScheduleItem({ id: 'next-account' })])))
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.data?.habitsById.has('next-account')).toBe(true))
    expect(Array.from(result.current.data!.habitsById.keys())).toEqual(['next-account'])
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it.each([false, true])('observes cached habits without fetching with a warm list=%s', async (warm) => {
    const wrapper = createWrapper()
    const habit = makeScheduleItem()
    if (warm) queryClient.setQueryData(habitKeys.list({}), [habit])
    const { result, unmount } = renderHook(() => useHabits({}, undefined, { enabled: false }), { wrapper })
    expect(result.current.data?.habitsById.get(habit.id)?.title).toBe(warm ? habit.title : undefined)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: habitKeys.lists() }) })
    expect(mockFetch).not.toHaveBeenCalled()
    unmount()
    queryClient.clear()
  })

  it('enriches undated Todos membership with dated overdue and schedule facts', async () => {
    const today = '2026-09-12'
    mockFetch.mockImplementation(async (url: string) => Response.json(makePaginatedResponse(
      url.includes('dateFrom=') ? createHabitViewScheduleItems(today) : createHabitViewItems(today, 'all'),
    )))
    const { result } = renderHook(() => useHabits({}, undefined, { scheduleDate: today }), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const habits = result.current.data!
    expect(habits.habitsById.has('future')).toBe(true)
    expect(result.current.getChildren('parent').map((habit) => habit.id)).toEqual(['today-child', 'future-child'])
    const overdue = habits.habitsById.get('overdue')!
    expect(buildHabitDateBuckets([overdue], today)[0]?.key).toBe('__overdue__')
    expect(canLogHabitOnDate(overdue, today, today)).toBe(true)
    expect(canLogHabitOnDate(habits.habitsById.get('parent')!, today, today)).toBe(true)
  })

  it('fetches habits and provides getChildren helper', async () => {
    const items = [
      makeScheduleItem({
        id: 'parent',
        title: 'Parent',
        position: 0,
        hasSubHabits: true,
        children: [
          {
            id: 'child-1',
            title: 'Child 1',
            description: null,
            frequencyUnit: null,
            frequencyQuantity: null,
            isBadHabit: false,
            isCompleted: false,
            isGeneral: false,
            isFlexible: false,
            days: [],
            dueDate: '2025-01-01',
            dueTime: null,
            dueEndTime: null,
            endDate: null,
            position: 0,
            checklistItems: [],
            tags: [],
            children: [],
            hasSubHabits: false,
            isLoggedInRange: false,
            instances: [],
          },
        ],
      }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedResponse(items)),
    })

    const { result } = renderHook(
      () => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }),
      { wrapper: createWrapper() },
    )

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const children = result.current.getChildren('parent')
    expect(children).toHaveLength(1)
    expect(children[0]!.id).toBe('child-1')
  })

  it('renders server-provided habits without waiting for a client request', () => {
    const initialHabit = makeScheduleItem({ title: 'Already available' })

    const { result } = renderHook(
      () => useHabits(
        { dateFrom: '2025-01-01', dateTo: '2025-01-01' },
        [initialHabit],
      ),
      { wrapper: createWrapper() },
    )

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data?.habitsById.get(initialHabit.id)?.title).toBe('Already available')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty array for getChildren when no data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedResponse([])),
    })

    const { result } = renderHook(
      () => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }),
      { wrapper: createWrapper() },
    )

    expect(result.current.getChildren('nonexistent')).toEqual([])
    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.topLevelHabits).toEqual([])
    expect(result.current.data?.habitsById.size).toBe(0)
    expect(result.current.getChildren('nonexistent')).toEqual([])
  })

  it('fetches multiple pages when no dateFrom and totalPages > 1', async () => {
    const firstPage: PaginatedResponse<HabitScheduleItem> = {
      items: [makeScheduleItem({ id: 'h-1', title: 'Habit 1' })],
      page: 1,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
    }
    const secondPage: PaginatedResponse<HabitScheduleItem> = {
      items: [makeScheduleItem({ id: 'h-2', title: 'Habit 2' })],
      page: 2,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
    }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(firstPage),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(secondPage),
      })

    const { result } = renderHook(
      () => useHabits({}),
      { wrapper: createWrapper() },
    )

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.habitsById.size).toBe(2)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/api/habits?pageSize=200')
    expect(mockFetch.mock.calls[1]?.[0]).toBe('/api/habits?page=2&pageSize=200')
  })

  it('loads a scheduled detail parent from page two while keeping ordinary day lists on page one', async () => {
    const firstPage = { items: [makeScheduleItem({ id: 'other' })], page: 1, pageSize: 1, totalCount: 2, totalPages: 2 }
    const secondPage = { items: [makeScheduleItem({ id: 'parent', children: [{
      id: 'child', title: 'Child', description: null, frequencyUnit: null, frequencyQuantity: null,
      isBadHabit: false, isCompleted: false, isGeneral: false, isFlexible: false, days: [],
      dueDate: '2025-01-01', dueTime: null, dueEndTime: null, endDate: null, position: 0,
      checklistItems: [], tags: [], children: [], hasSubHabits: false, isLoggedInRange: false, instances: [],
    }] })], page: 2, pageSize: 1, totalCount: 2, totalPages: 2 }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPage) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondPage) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPage) })
    const filters = { dateFrom: '2025-01-01', dateTo: '2025-01-01' }
    const wrapper = createWrapper()
    const detail = renderHook(() => useHabits(filters, undefined, { completeDay: true }), { wrapper })
    expect(detail.result.current.isFetching).toBe(true)
    await act(async () => { await detail.result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true))
    expect(detail.result.current.getChildren('parent').map((child) => child.id)).toEqual(['child'])
    const ordinary = renderHook(() => useHabits(filters), { wrapper })
    expect(ordinary.result.current.isFetching).toBe(true)
    await act(async () => { await ordinary.result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(ordinary.result.current.isSuccess).toBe(true))
    expect(ordinary.result.current.getChildren('parent')).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('uses a larger page size for all-view habit lists', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedResponse([
        makeScheduleItem({ id: 'h-1', title: 'Habit 1' }),
      ])),
    })

    const { result } = renderHook(
      () => useHabits({}),
      { wrapper: createWrapper() },
    )

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/api/habits?pageSize=200')
  })

  it('keeps habits fresh for five minutes and limits palette searches to one page', async () => {
    const items = Array.from({ length: 200 }, (_, index) => makeScheduleItem({ id: `h-${index}` }))
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...makePaginatedResponse(items), totalCount: 450, totalPages: 3 }),
    })

    const { result } = renderHook(() => useSearchHabits({ search: 'run', page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(QUERY_STALE_TIMES.habits).toBe(5 * 60 * 1000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/api/habits?search=run&page=1&pageSize=20')
  })

  it('keeps unbounded search results complete', async () => {
    const firstPage = { ...makePaginatedResponse([makeScheduleItem({ id: 'first' })]), totalPages: 2 }
    const secondPage = { ...makePaginatedResponse([makeScheduleItem({ id: 'second' })]), page: 2, totalPages: 2 }
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPage) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondPage) })

    const { result } = renderHook(() => useHabits({ search: 'run' }), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.habitsById.size).toBe(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('useHabitDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches habit detail when id is provided', async () => {
    const detail: HabitDetail = {
      id: 'h-1',
      title: 'Exercise',
      description: 'Daily exercise routine',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      isBadHabit: false,
      isCompleted: false,
      isGeneral: false,
      isFlexible: false,
      days: [],
      dueDate: '2025-01-01',
      dueTime: null,
      dueEndTime: null,
      endDate: null,
      position: 0,
      checklistItems: [],
      createdAtUtc: '2025-01-01T00:00:00Z',
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      children: [],
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    })

    const { result } = renderHook(() => useHabitDetail('h-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.title).toBe('Exercise')
  })

  it('does not fetch when id is null', () => {
    renderHook(() => useHabitDetail(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useHabitMetrics', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches metrics and exposes weeklyPercentage and monthlyPercentage', async () => {
    const metrics: HabitMetrics = {
      weeklyCompletionRate: 85,
      monthlyCompletionRate: 70,
      currentStreak: 5,
      longestStreak: 14,
      totalCompletions: 100,
      lastCompletedDate: null,
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metrics),
    })

    const { result } = renderHook(() => useHabitMetrics('h-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.weeklyPercentage).toBe(85)
    expect(result.current.monthlyPercentage).toBe(70)
  })

  it('returns 0 for percentages when data is not loaded', () => {
    const { result } = renderHook(() => useHabitMetrics(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.weeklyPercentage).toBe(0)
    expect(result.current.monthlyPercentage).toBe(0)
  })
})

describe('useHabitLogs', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches logs for a given habit id', async () => {
    const logs: HabitLog[] = [
      { id: 'log-1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T10:00:00Z' },
      { id: 'log-2', date: '2025-01-16', value: 1, createdAtUtc: '2025-01-16T10:00:00Z' },
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(logs),
    })

    const { result } = renderHook(() => useHabitLogs('h-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('does not fetch when id is null', () => {
    renderHook(() => useHabitLogs(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useHabitFullDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches full detail when id is provided', async () => {
    const detail: HabitFullDetail = {
      habit: {
        id: 'h-1',
        title: 'Exercise',
        description: 'Daily exercise',
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        isBadHabit: false,
        isCompleted: false,
        isGeneral: false,
        isFlexible: false,
        days: [],
        dueDate: '2025-01-01',
        dueTime: null,
        dueEndTime: null,
        endDate: null,
        position: 0,
        checklistItems: [],
        createdAtUtc: '2025-01-01T00:00:00Z',
        reminderEnabled: false,
        reminderTimes: [],
        scheduledReminders: [],
        children: [],
      },
      logs: [],
      metrics: {
        weeklyCompletionRate: 80,
        monthlyCompletionRate: 75,
        currentStreak: 5,
        longestStreak: 10,
        totalCompletions: 50,
        lastCompletedDate: null,
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    })

    const { result } = renderHook(() => useHabitFullDetail('h-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.habit.title).toBe('Exercise')
  })

  it('does not fetch when id is null', () => {
    renderHook(() => useHabitFullDetail(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useTotalHabitCount', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns count from lightweight count response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 42 }),
    })

    const { result } = renderHook(() => useTotalHabitCount(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: habitKeys.count() }, { cancelRefetch: false, throwOnError: true })
    })
    await waitFor(() => expect(result.current).toBe(42))
  })

  it('returns 0 before data loads', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useTotalHabitCount(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(0)
  })
})

describe('habit detail response validation', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })


  it.each([
    { label: 'empty habit page', body: {} },
    { label: 'missing page totals', body: { items: [] } },
    { label: 'invalid scheduled habit', body: { items: [{}], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 } },
  ])('rejects $label used by habit detail', async ({ body }) => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
    const { result } = renderHook(() => useHabits({}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ name: 'ZodError' })
  })

  it('rejects an invalid later habit page', async () => {
    const firstPage = { items: [createMockHabitScheduleItem()], page: 1, pageSize: 1, totalCount: 2, totalPages: 2 }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPage) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    const { result } = renderHook(() => useHabits({}), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ name: 'ZodError' })
  })

  it.each(invalidMetricsBodies)('rejects metrics with $label', async ({ body }) => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
    const { result } = renderHook(() => useHabitMetrics('h-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ name: 'ZodError' })
  })

  it.each([
    { label: 'habit detail', hook: useHabitDetail, body: {} },
    { label: 'logs container', hook: useHabitLogs, body: {} },
    { label: 'log entry', hook: useHabitLogs, body: [{}] },
    { label: 'full detail container', hook: useHabitFullDetail, body: {} },
    { label: 'nested habit', hook: useHabitFullDetail, body: { ...validFullDetail, habit: {} } },
    { label: 'nested metrics', hook: useHabitFullDetail, body: { ...validFullDetail, metrics: {} } },
    { label: 'nested logs', hook: useHabitFullDetail, body: { ...validFullDetail, logs: [{}] } },
  ])('rejects invalid $label', async ({ hook, body }) => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
    const { result } = renderHook(() => hook('h-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ name: 'ZodError' })
  })

  it.each([
    { label: 'metrics', hook: useHabitMetrics },
    { label: 'habit detail', hook: useHabitDetail },
    { label: 'logs', hook: useHabitLogs },
    { label: 'full detail', hook: useHabitFullDetail },
  ])('propagates a failed $label request', async ({ hook }) => {
    const failure = new Error('Request failed')
    mockFetch.mockRejectedValue(failure)
    const { result } = renderHook(() => hook('h-1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBe(failure)
  })
})


describe('serialized reminder reads through the web queries', () => {
  beforeEach(() => { mockFetch.mockReset() })
  it('loads list, detail and full detail with canonical reminders', async () => {
    const { useAuthStore } = await import('@/stores/auth-store')
    mockFetch.mockImplementation(async (url: string) => Response.json(
      url.endsWith('/detail') ? reminderWire.HabitFullDetailResponse
        : url.includes('?') ? reminderWire['PaginatedResponse`1'] : reminderWire.HabitDetailResponse,
    ))
    const wrapper = createWrapper()
    const { result, unmount } = renderHook(() => {
      const list = useHabits({})
      const detail = useHabitDetail('reminder')
      const full = useHabitFullDetail('reminder')
      return {
        list: { data: list.data, isSuccess: list.isSuccess },
        detail: { data: detail.data, isSuccess: detail.isSuccess },
        full: { data: full.data, isSuccess: full.isSuccess },
      }
    }, { wrapper })
    await waitFor(() => {
      expect(result.current.list.isSuccess).toBe(true)
      expect(result.current.detail.isSuccess).toBe(true)
      expect(result.current.full.isSuccess).toBe(true)
    })
    const reminders = { scheduledReminders: [{ when: 'same_day' }, { when: 'day_before' }], relativeReminders: [{ when: 'same_day' }, { when: 'day_before' }] }
    expect(result.current.list.data?.topLevelHabits[0]).toMatchObject(reminders)
    expect(result.current.detail.data).toMatchObject(reminders)
    expect(result.current.full.data?.habit).toMatchObject(reminders)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState).toHaveBeenCalledTimes(3)
    expect(mockRecoverSessionRefreshFailure).toHaveBeenCalledTimes(3)
    expect(mockConfirmSessionRefreshFailure).not.toHaveBeenCalled()
    unmount()
  })
})
