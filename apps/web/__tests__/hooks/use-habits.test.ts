import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHabits, useLogHabit, useSkipHabit, useCreateHabit, useDeleteHabit } from '@/hooks/use-habits'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { HabitScheduleItem, PaginatedResponse } from '@orbit/shared/types/habit'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock server actions
vi.mock('@/app/actions/habits', () => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  deleteHabit: vi.fn(),
  logHabit: vi.fn(),
  skipHabit: vi.fn(),
  reorderHabits: vi.fn(),
  duplicateHabit: vi.fn(),
  updateChecklist: vi.fn(),
  createSubHabit: vi.fn(),
  moveHabitParent: vi.fn(),
  bulkCreateHabits: vi.fn(),
  bulkDeleteHabits: vi.fn(),
  bulkLogHabits: vi.fn(),
  bulkSkipHabits: vi.fn(),
}))

// Mock UI store
vi.mock('@/stores/ui-store', () => ({
  useUIStore: Object.assign(
    () => ({
      activeFilters: {},
      setStreakCelebration: vi.fn(),
      checkAllDoneCelebration: vi.fn(),
      setLastCreatedHabitId: vi.fn(),
    }),
    {
      getState: () => ({
        activeFilters: {},
        setStreakCelebration: vi.fn(),
        checkAllDoneCelebration: vi.fn(),
        setLastCreatedHabitId: vi.fn(),
      }),
    },
  ),
}))

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
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

describe('useHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and normalizes habits', async () => {
    const items = [
      makeScheduleItem({ id: 'h-1', title: 'Exercise', position: 1 }),
      makeScheduleItem({ id: 'h-2', title: 'Read', position: 0 }),
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

    expect(result.current.data).toBeDefined()
    expect(result.current.data!.habitsById.size).toBe(2)
    // Top-level should be sorted by position
    expect(result.current.data!.topLevelHabits[0]!.id).toBe('h-2')
    expect(result.current.data!.topLevelHabits[1]!.id).toBe('h-1')
  })

  it('normalizes children into flat map', async () => {
    const items = [
      makeScheduleItem({
        id: 'parent',
        title: 'Parent',
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
            position: null,
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

    expect(result.current.data!.habitsById.has('child-1')).toBe(true)
    expect(result.current.data!.topLevelHabits).toHaveLength(1) // child not in top-level
    expect(result.current.data!.childrenByParent.get('parent')).toContain('child-1')
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const { result } = renderHook(
      () => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Server error')
  })

  it('returns empty data for empty response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedResponse([])),
    })

    const { result } = renderHook(
      () => useHabits({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.habitsById.size).toBe(0)
    expect(result.current.data!.topLevelHabits).toEqual([])
    expect(result.current.data!.totalCount).toBe(0)
  })
})

describe('useLogHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls logHabit action and invalidates caches on settled', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-1',
      isFirstCompletionToday: false,
      currentStreak: 1,
    })

    // Seed initial data for optimistic update
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makePaginatedResponse([makeScheduleItem({ id: 'h-1' })]),
        ),
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useLogHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1' })
    })

    expect(mockedLogHabit).toHaveBeenCalledWith('h-1', undefined)
  })

  it('passes note and date to logHabit action', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-2',
      isFirstCompletionToday: false,
      currentStreak: 1,
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useLogHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        habitId: 'h-1',
        note: 'Great run!',
        date: '2025-01-15',
      })
    })

    expect(mockedLogHabit).toHaveBeenCalledWith('h-1', {
      note: 'Great run!',
      date: '2025-01-15',
    })
  })
})

describe('useSkipHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls skipHabit action', async () => {
    const { skipHabit } = await import('@/app/actions/habits')
    const mockedSkipHabit = vi.mocked(skipHabit)
    mockedSkipHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useSkipHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1' })
    })

    expect(mockedSkipHabit).toHaveBeenCalledWith('h-1', undefined)
  })

  it('passes date to skipHabit action', async () => {
    const { skipHabit } = await import('@/app/actions/habits')
    const mockedSkipHabit = vi.mocked(skipHabit)
    mockedSkipHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useSkipHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1', date: '2025-01-15' })
    })

    expect(mockedSkipHabit).toHaveBeenCalledWith('h-1', '2025-01-15')
  })
})

describe('useCreateHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls createHabit action with request data', async () => {
    const { createHabit } = await import('@/app/actions/habits')
    const mockedCreateHabit = vi.mocked(createHabit)
    mockedCreateHabit.mockResolvedValue({ id: 'new-h' })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useCreateHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ title: 'New Habit' })
    })

    expect(mockedCreateHabit).toHaveBeenCalledWith({ title: 'New Habit' })
  })
})

describe('useDeleteHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls deleteHabit action with habit ID', async () => {
    const { deleteHabit } = await import('@/app/actions/habits')
    const mockedDeleteHabit = vi.mocked(deleteHabit)
    mockedDeleteHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDeleteHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(mockedDeleteHabit).toHaveBeenCalledWith('h-1')
  })
})
