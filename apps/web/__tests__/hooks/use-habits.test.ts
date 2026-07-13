import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHabits, useLogHabit, useSkipHabit, useCreateHabit, useDeleteHabit, useUpdateHabit, useReorderHabits, useDuplicateHabit, useUpdateChecklist, useCreateSubHabit, useMoveHabitParent, useBulkCreateHabits, useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import type { HabitScheduleChild, HabitScheduleItem, PaginatedResponse } from '@orbit/shared/types/habit'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowQueued = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: vi.fn(),
    showToast: vi.fn(),
    showQueued: mockShowQueued,
    dismissToast: vi.fn(),
  }),
}))

vi.mock('@/app/actions/habits', () => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  deleteHabit: vi.fn(),
  restoreHabit: vi.fn(),
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
    linkedGoals: [],
    instances: [],
    ...overrides,
  }
}

function makeScheduleChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    id: 'child-1',
    title: 'Child task',
    description: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-15',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    scheduledDates: ['2025-01-15'],
    isOverdue: false,
    position: 0,
    checklistItems: [],
    tags: [],
    children: [],
    hasSubHabits: false,
    isLoggedInRange: false,
    instances: [{ date: '2025-01-15', status: 'Pending', logId: null }],
    searchMatches: null,
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
    expect(result.current.data!.topLevelHabits).toHaveLength(1)
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

  it('invalidates lists, summary, goals, gamification, and profile on settle (parity with mobile)', async () => {
    const { logHabit } = await import('@/app/actions/habits')
    vi.mocked(logHabit).mockResolvedValue({
      logId: 'log-x',
      isFirstCompletionToday: false,
      currentStreak: 1,
    })

    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useLogHabit(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.calendarPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.summaryPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileKeys.all })
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
    vi.useRealTimers()
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

  it('invalidates lists, summary, goals, gamification, and profile on settle (parity with mobile)', async () => {
    const { skipHabit } = await import('@/app/actions/habits')
    vi.mocked(skipHabit).mockResolvedValue(undefined)

    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSkipHabit(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'h-1' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.calendarPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.summaryPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileKeys.all })
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

  it('optimistically postpones one-time child skips instead of completing them', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))

    const { skipHabit } = await import('@/app/actions/habits')
    const mockedSkipHabit = vi.mocked(skipHabit)
    mockedSkipHabit.mockResolvedValue(undefined)

    const queryClient = createQueryClient()
    queryClient.setQueryData<HabitScheduleItem[]>(
      habitKeys.list({}),
      [makeScheduleItem({
        id: 'parent-1',
        hasSubHabits: true,
        children: [makeScheduleChild({ id: 'child-1', frequencyUnit: null })],
      })],
    )

    const { result } = renderHook(() => useSkipHabit(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ habitId: 'child-1' })
    })

    const child = queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.[0]?.children[0]
    expect(child).toMatchObject({
      isCompleted: false,
      dueDate: '2025-01-16',
      scheduledDates: ['2025-01-16'],
      isOverdue: false,
      instances: [{ date: '2025-01-16', status: 'Pending', logId: null }],
    })

    vi.useRealTimers()
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

  it('shows an undo snackbar on successful delete and restores when undone', async () => {
    mockShowQueued.mockReset()
    const { deleteHabit, restoreHabit } = await import('@/app/actions/habits')
    vi.mocked(deleteHabit).mockResolvedValue(undefined)
    vi.mocked(restoreHabit).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteHabit(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(mockShowQueued).toHaveBeenCalledWith(
      'undo.habitDeleted',
      'undo.action',
      expect.any(Function),
      expect.any(Function),
    )

    const performUndo = mockShowQueued.mock.calls.at(-1)![2] as () => void
    await act(async () => {
      performUndo()
    })

    await waitFor(() => expect(vi.mocked(restoreHabit)).toHaveBeenCalledWith('h-1'))
  })
})

describe('useRestoreHabit', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockShowSuccess.mockReset()
    mockShowError.mockReset()
  })

  it('calls restoreHabit action, invalidates delete-affected queries, and confirms', async () => {
    const { restoreHabit } = await import('@/app/actions/habits')
    vi.mocked(restoreHabit).mockResolvedValue(undefined)

    const { useRestoreHabit } = await import('@/hooks/use-habits')
    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRestoreHabit(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync('h-1')
    })

    expect(vi.mocked(restoreHabit)).toHaveBeenCalledWith('h-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.calendarPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.count() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: habitKeys.summaryPrefix() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mockShowSuccess).toHaveBeenCalledWith('undo.restored')
  })

  it('surfaces an error toast when restore fails', async () => {
    const { restoreHabit } = await import('@/app/actions/habits')
    vi.mocked(restoreHabit).mockRejectedValue(new Error('nope'))

    const { useRestoreHabit } = await import('@/hooks/use-habits')
    const { result } = renderHook(() => useRestoreHabit(), { wrapper: createWrapper() })

    await act(async () => {
      try {
        await result.current.mutateAsync('h-1')
      } catch {
      }
    })

    expect(mockShowError).toHaveBeenCalledWith('undo.restoreFailed')
  })
})


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

  it('optimistically patches emoji changes', async () => {
    const { useUpdateHabit } = await import('@/hooks/use-habits')
    const { updateHabit } = await import('@/app/actions/habits')
    const mockedUpdateHabit = vi.mocked(updateHabit)
    mockedUpdateHabit.mockResolvedValue(undefined)

    const queryClient = createQueryClient()
    queryClient.setQueryData<HabitScheduleItem[]>(habitKeys.list({}), [
      makeScheduleItem({ id: 'h-1', emoji: '🏃' }),
    ])

    const { result } = renderHook(() => useUpdateHabit(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        habitId: 'h-1',
        data: { title: 'Updated Exercise', isBadHabit: false, emoji: '💪' },
      })
    })

    expect(
      queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))?.[0]?.emoji,
    ).toBe('💪')
  })
})


describe('useReorderHabits', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockShowError.mockReset()
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

  it('optimistically applies the new positions to the cached list before the action resolves', async () => {
    const { useReorderHabits } = await import('@/hooks/use-habits')
    const { reorderHabits } = await import('@/app/actions/habits')
    vi.mocked(reorderHabits).mockImplementation(() => new Promise(() => {}))

    const queryClient = createQueryClient()
    queryClient.setQueryData<HabitScheduleItem[]>(habitKeys.list({}), [
      makeScheduleItem({
        id: 'parent-1',
        position: 0,
        hasSubHabits: true,
        children: [
          makeScheduleChild({ id: 'child-a', position: 0 }),
          makeScheduleChild({ id: 'child-b', position: 1 }),
        ],
      }),
      makeScheduleItem({ id: 'h-2', position: 1 }),
    ])

    const { result } = renderHook(() => useReorderHabits(), {
      wrapper: createWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({
        positions: [
          { habitId: 'h-2', position: 0 },
          { habitId: 'parent-1', position: 1 },
          { habitId: 'child-b', position: 0 },
          { habitId: 'child-a', position: 1 },
        ],
      })
    })

    await waitFor(() => {
      const cached = queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))
      expect(cached?.find((h) => h.id === 'h-2')?.position).toBe(0)
    })

    const cached = queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))!
    expect(cached.find((h) => h.id === 'parent-1')?.position).toBe(1)
    const parent = cached.find((h) => h.id === 'parent-1')!
    expect(parent.children.find((c) => c.id === 'child-b')?.position).toBe(0)
    expect(parent.children.find((c) => c.id === 'child-a')?.position).toBe(1)
  })

  it('rolls back the cached order and surfaces an error toast when the reorder fails', async () => {
    const { useReorderHabits } = await import('@/hooks/use-habits')
    const { reorderHabits } = await import('@/app/actions/habits')
    vi.mocked(reorderHabits).mockRejectedValue(new Error('boom'))

    const queryClient = createQueryClient()
    queryClient.setQueryData<HabitScheduleItem[]>(habitKeys.list({}), [
      makeScheduleItem({ id: 'h-1', position: 0 }),
      makeScheduleItem({ id: 'h-2', position: 1 }),
    ])

    const { result } = renderHook(() => useReorderHabits(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          positions: [
            { habitId: 'h-2', position: 0 },
            { habitId: 'h-1', position: 1 },
          ],
        })
      } catch {
      }
    })

    const cached = queryClient.getQueryData<HabitScheduleItem[]>(habitKeys.list({}))!
    expect(cached.find((h) => h.id === 'h-1')?.position).toBe(0)
    expect(cached.find((h) => h.id === 'h-2')?.position).toBe(1)
    expect(mockShowError).toHaveBeenCalledWith('habits.reorderFailed')
  })
})


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

  it('optimistically updates the detail and fullDetail caches', async () => {
    const { useUpdateChecklist } = await import('@/hooks/use-habits')
    const { updateChecklist } = await import('@/app/actions/habits')
    vi.mocked(updateChecklist).mockImplementation(
      () => new Promise(() => {}),
    )

    const queryClient = createQueryClient()
    queryClient.setQueryData(habitKeys.detail('h-1'), {
      id: 'h-1',
      title: 'A',
      checklistItems: [{ text: 'Old', isChecked: false }],
    } as unknown)
    queryClient.setQueryData(habitKeys.fullDetail('h-1'), {
      habit: {
        id: 'h-1',
        title: 'A',
        checklistItems: [{ text: 'Old', isChecked: false }],
      },
      metrics: null,
      logs: [],
    } as unknown)

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(() => useUpdateChecklist(), { wrapper })

    const items = [{ text: 'New', isChecked: true }]
    act(() => {
      result.current.mutate({ habitId: 'h-1', items })
    })

    await waitFor(() => {
      const detail = queryClient.getQueryData<{ checklistItems: unknown }>(
        habitKeys.detail('h-1'),
      )
      expect(detail?.checklistItems).toEqual(items)
    })

    const full = queryClient.getQueryData<{ habit: { checklistItems: unknown } }>(
      habitKeys.fullDetail('h-1'),
    )
    expect(full?.habit.checklistItems).toEqual(items)
  })

  it('rolls back detail and fullDetail caches when the mutation errors', async () => {
    const { useUpdateChecklist } = await import('@/hooks/use-habits')
    const { updateChecklist } = await import('@/app/actions/habits')
    vi.mocked(updateChecklist).mockRejectedValue(new Error('boom'))

    const queryClient = createQueryClient()
    const originalDetail = {
      id: 'h-1',
      title: 'A',
      checklistItems: [{ text: 'Original', isChecked: false }],
    }
    const originalFull = {
      habit: {
        id: 'h-1',
        title: 'A',
        checklistItems: [{ text: 'Original', isChecked: false }],
      },
      metrics: null,
      logs: [],
    }
    queryClient.setQueryData(habitKeys.detail('h-1'), originalDetail as unknown)
    queryClient.setQueryData(habitKeys.fullDetail('h-1'), originalFull as unknown)

    const wrapper = createWrapper(queryClient)
    const { result } = renderHook(() => useUpdateChecklist(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          habitId: 'h-1',
          items: [{ text: 'Optimistic', isChecked: true }],
        })
      } catch {
      }
    })

    const detail = queryClient.getQueryData<typeof originalDetail>(
      habitKeys.detail('h-1'),
    )
    const full = queryClient.getQueryData<typeof originalFull>(
      habitKeys.fullDetail('h-1'),
    )
    expect(detail?.checklistItems).toEqual(originalDetail.checklistItems)
    expect(full?.habit.checklistItems).toEqual(originalFull.habit.checklistItems)
  })
})


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
