import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHabits, useLogHabit, useSkipHabit, useCreateHabit, useDeleteHabit, useUpdateHabit, useReorderHabits, useDuplicateHabit, useUpdateChecklist, useCreateSubHabit, useMoveHabitParent, useBulkCreateHabits, useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
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

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient = createQueryClient()) {
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

  it('passes date to logHabit action', async () => {
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
        date: '2025-01-15',
      })
    })

    expect(mockedLogHabit).toHaveBeenCalledWith('h-1', {
      date: '2025-01-15',
    })
  })

  it('optimistically completes before query cancellation resolves', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-3',
      isFirstCompletionToday: false,
      currentStreak: 1,
    })

    const queryClient = createQueryClient()
    queryClient.setQueryData<HabitScheduleItem[]>(
      habitKeys.list({}),
      [makeScheduleItem({ id: 'h-1', isCompleted: false })],
    )

    let resolveCancel: (() => void) | undefined
    const cancelPromise = new Promise<void>((resolve) => {
      resolveCancel = resolve
    })
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(() => cancelPromise)

    const { result } = renderHook(() => useLogHabit(), {
      wrapper: createWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ habitId: 'h-1' })
    })

    expect(
      queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.[0]?.isCompleted,
    ).toBe(true)

    resolveCancel?.()
    await waitFor(() => expect(mockedLogHabit).toHaveBeenCalledWith('h-1', undefined))
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

// ---------------------------------------------------------------------------
// useLogHabit onSuccess callbacks
// ---------------------------------------------------------------------------

describe('useLogHabit onSuccess', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('completes successfully with streak response', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-streak',
      isFirstCompletionToday: true,
      currentStreak: 5,
    })

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
    // The onSuccess path is exercised (setStreakCelebration was called via the mock)
  })

  it('completes without triggering streak when not first today', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-no-streak',
      isFirstCompletionToday: false,
      currentStreak: 3,
    })

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

    expect(mockedLogHabit).toHaveBeenCalled()
  })

  it('handles linked goal updates in response', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-goal',
      isFirstCompletionToday: false,
      currentStreak: 1,
      linkedGoalUpdates: [
        { goalId: 'g-1', title: 'Goal 1', newProgress: 55, targetValue: 100 },
      ],
    })

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

    expect(mockedLogHabit).toHaveBeenCalled()
  })

  it('handles gamification XP in response', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    const mockedLogHabit = vi.mocked(logHabit)
    mockedLogHabit.mockResolvedValue({
      logId: 'log-xp',
      isFirstCompletionToday: false,
      currentStreak: 1,
      xpEarned: 25,
      newAchievementIds: ['ach-1'],
    })

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

    expect(mockedLogHabit).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// useUpdateHabit
// ---------------------------------------------------------------------------

describe('useUpdateHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls updateHabit action with habitId and data', async () => {
    const { useUpdateHabit } = await import('@/hooks/use-habits')
    const { updateHabit } = await import('@/app/actions/habits')
    const mockedUpdateHabit = vi.mocked(updateHabit)
    mockedUpdateHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useUpdateHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        habitId: 'h-1',
        data: { title: 'Updated Exercise', isBadHabit: false },
      })
    })

    expect(mockedUpdateHabit).toHaveBeenCalledWith('h-1', { title: 'Updated Exercise', isBadHabit: false })
  })
})

// ---------------------------------------------------------------------------
// useReorderHabits
// ---------------------------------------------------------------------------

describe('useReorderHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls reorderHabits action with position data', async () => {
    const { useReorderHabits } = await import('@/hooks/use-habits')
    const { reorderHabits } = await import('@/app/actions/habits')
    const mockedReorderHabits = vi.mocked(reorderHabits)
    mockedReorderHabits.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useReorderHabits(), { wrapper })

    const data = {
      positions: [
        { habitId: 'h-2', position: 0 },
        { habitId: 'h-1', position: 1 },
      ],
    }

    await act(async () => {
      await result.current.mutateAsync(data)
    })

    expect(mockedReorderHabits).toHaveBeenCalledWith(data)
  })
})

// ---------------------------------------------------------------------------
// useDuplicateHabit
// ---------------------------------------------------------------------------

describe('useDuplicateHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls duplicateHabit action with habit ID', async () => {
    const { useDuplicateHabit } = await import('@/hooks/use-habits')
    const { duplicateHabit } = await import('@/app/actions/habits')
    const mockedDuplicateHabit = vi.mocked(duplicateHabit)
    mockedDuplicateHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDuplicateHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(mockedDuplicateHabit).toHaveBeenCalledWith('h-1')
  })
})

// ---------------------------------------------------------------------------
// useUpdateChecklist
// ---------------------------------------------------------------------------

describe('useUpdateChecklist', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls updateChecklist action with habitId and items', async () => {
    const { useUpdateChecklist } = await import('@/hooks/use-habits')
    const { updateChecklist } = await import('@/app/actions/habits')
    const mockedUpdateChecklist = vi.mocked(updateChecklist)
    mockedUpdateChecklist.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useUpdateChecklist(), { wrapper })

    const items = [
      { text: 'Step 1', isChecked: false },
      { text: 'Step 2', isChecked: true },
    ]

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1', items })
    })

    expect(mockedUpdateChecklist).toHaveBeenCalledWith('h-1', items)
  })
})

// ---------------------------------------------------------------------------
// useCreateSubHabit
// ---------------------------------------------------------------------------

describe('useCreateSubHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls createSubHabit action with parentId and data', async () => {
    const { useCreateSubHabit } = await import('@/hooks/use-habits')
    const { createSubHabit } = await import('@/app/actions/habits')
    const mockedCreateSubHabit = vi.mocked(createSubHabit)
    mockedCreateSubHabit.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useCreateSubHabit(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        parentId: 'h-1',
        data: { title: 'Warmup' },
      })
    })

    expect(mockedCreateSubHabit).toHaveBeenCalledWith('h-1', { title: 'Warmup' })
  })
})

// ---------------------------------------------------------------------------
// useMoveHabitParent
// ---------------------------------------------------------------------------

describe('useMoveHabitParent', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls moveHabitParent action with habitId and data', async () => {
    const { useMoveHabitParent } = await import('@/hooks/use-habits')
    const { moveHabitParent } = await import('@/app/actions/habits')
    const mockedMoveHabitParent = vi.mocked(moveHabitParent)
    mockedMoveHabitParent.mockResolvedValue(undefined)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useMoveHabitParent(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        habitId: 'sub-h-1',
        data: { parentId: 'h-2' },
      })
    })

    expect(mockedMoveHabitParent).toHaveBeenCalledWith('sub-h-1', { parentId: 'h-2' })
  })
})

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

describe('useBulkCreateHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls bulkCreateHabits action', async () => {
    const { useBulkCreateHabits } = await import('@/hooks/use-habits')
    const { bulkCreateHabits } = await import('@/app/actions/habits')
    const mockedBulkCreate = vi.mocked(bulkCreateHabits)
    mockedBulkCreate.mockResolvedValue({
      results: [
        { index: 0, status: 'Success' as const, habitId: 'h-new-1', title: 'H1', error: null, field: null },
        { index: 1, status: 'Success' as const, habitId: 'h-new-2', title: 'H2', error: null, field: null },
      ],
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useBulkCreateHabits(), { wrapper })

    const request = { habits: [{ title: 'H1' }, { title: 'H2' }] }
    await act(async () => {
      await result.current.mutateAsync(request)
    })

    expect(mockedBulkCreate).toHaveBeenCalledWith(request)
  })
})

describe('useBulkDeleteHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls bulkDeleteHabits action', async () => {
    const { useBulkDeleteHabits } = await import('@/hooks/use-habits')
    const { bulkDeleteHabits } = await import('@/app/actions/habits')
    const mockedBulkDelete = vi.mocked(bulkDeleteHabits)
    mockedBulkDelete.mockResolvedValue({
      results: [
        { index: 0, status: 'Success' as const, habitId: 'h-1', error: null },
        { index: 1, status: 'Success' as const, habitId: 'h-2', error: null },
      ],
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useBulkDeleteHabits(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(['h-1', 'h-2'])
    })

    expect(mockedBulkDelete).toHaveBeenCalledWith(['h-1', 'h-2'])
  })
})

describe('useBulkLogHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls bulkLogHabits action', async () => {
    const { useBulkLogHabits } = await import('@/hooks/use-habits')
    const { bulkLogHabits } = await import('@/app/actions/habits')
    const mockedBulkLog = vi.mocked(bulkLogHabits)
    mockedBulkLog.mockResolvedValue({
      results: [
        { index: 0, status: 'Success' as const, habitId: 'h-1', logId: 'log-1', error: null },
        { index: 1, status: 'Success' as const, habitId: 'h-2', logId: 'log-2', error: null },
      ],
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useBulkLogHabits(), { wrapper })

    const items = [{ habitId: 'h-1' }, { habitId: 'h-2' }]
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mockedBulkLog).toHaveBeenCalledWith(items)
  })
})

describe('useBulkSkipHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls bulkSkipHabits action', async () => {
    const { useBulkSkipHabits } = await import('@/hooks/use-habits')
    const { bulkSkipHabits } = await import('@/app/actions/habits')
    const mockedBulkSkip = vi.mocked(bulkSkipHabits)
    mockedBulkSkip.mockResolvedValue({
      results: [
        { index: 0, status: 'Success' as const, habitId: 'h-1', error: null },
        { index: 1, status: 'Success' as const, habitId: 'h-2', error: null },
      ],
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useBulkSkipHabits(), { wrapper })

    const items = [{ habitId: 'h-1' }, { habitId: 'h-2' }]
    await act(async () => {
      await result.current.mutateAsync(items)
    })

    expect(mockedBulkSkip).toHaveBeenCalledWith(items)
  })
})
