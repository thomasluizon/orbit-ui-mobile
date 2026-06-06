import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useHabits,
  useHabitDetail,
  useHabitMetrics,
  useHabitLogs,
  useHabitFullDetail,
  useTotalHabitCount,
} from '@/hooks/use-habit-queries'
import type {
  HabitScheduleItem,
  HabitDetail,
  HabitFullDetail,
  HabitMetrics,
  PaginatedResponse,
} from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useHabits (query hook)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const children = result.current.getChildren('parent')
    expect(children).toHaveLength(1)
    expect(children[0]!.id).toBe('child-1')
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.habitsById.size).toBe(2)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/api/habits?pageSize=200')
    expect(mockFetch.mock.calls[1]?.[0]).toBe('/api/habits?page=2&pageSize=200')
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('/api/habits?pageSize=200')
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
