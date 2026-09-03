import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { gamificationKeys, habitKeys, goalKeys, profileKeys, tagKeys } from '@orbit/shared/query'
import { buildHabitHistoryMonth, isHabitCompletedOnDate } from '@orbit/shared/utils'
import type { ChecklistItem, CreateHabitRequest, HabitDetail, HabitScheduleChild, HabitScheduleItem, LogHabitResponse } from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { Goal } from '@orbit/shared/types/goal'

import {
  useBulkCreateHabits,
  useBulkDeleteHabits,
  useBulkLogHabits,
  useBulkSkipHabits,
  useCreateHabit,
  useCreateSubHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useLogHabit,
  useMoveHabitParent,
  useReorderHabits,
  useRestoreHabit,
  useSkipHabit,
  useUpdateChecklist,
  useUpdateHabit,
} from '@/hooks/use-habits'
import { useReviewReminderStore } from '@/stores/review-reminder-store'

const mocks = vi.hoisted(() => {
  class OfflineMutationPreflightError extends Error {}

  const state = {
    entries: [] as { key: readonly unknown[]; value: unknown }[],
    tempIds: [] as string[],
  }

  const matchesPrefix = (key: readonly unknown[], prefix: readonly unknown[]) =>
    prefix.every((value, index) => JSON.stringify(key[index]) === JSON.stringify(value))

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueriesData: vi.fn((filters: { queryKey: readonly unknown[] }) =>
      state.entries
        .filter((entry) => matchesPrefix(entry.key, filters.queryKey))
        .map((entry) => [entry.key, entry.value] as const),
    ),
    setQueriesData: vi.fn((
      filters: { queryKey: readonly unknown[] },
      updater: unknown,
    ) => {
      state.entries = state.entries.map((entry) => {
        if (!matchesPrefix(entry.key, filters.queryKey)) return entry
        return {
          ...entry,
          value: typeof updater === 'function' ? updater(entry.value) : updater,
        }
      })
    }),
    getQueryData: vi.fn((queryKey: readonly unknown[]) =>
      state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(queryKey))?.value,
    ),
    setQueryData: vi.fn((
      queryKey: readonly unknown[],
      updater: unknown,
    ) => {
      const index = state.entries.findIndex(
        (entry) => JSON.stringify(entry.key) === JSON.stringify(queryKey),
      )

      if (index >= 0) {
        const current = state.entries[index]
        if (!current) return
        state.entries[index] = {
          ...current,
          value: typeof updater === 'function' ? updater(current.value) : updater,
        }
        return
      }

      state.entries.push({
        key: queryKey,
        value: typeof updater === 'function' ? updater(undefined) : updater,
      })
    }),
  }

  return {
    state,
    queryClient,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => config),
    runQueuedMutation: vi.fn(({ queuedResult, queuedResultFactory }: {
      mutation: { type: string }
      queuedResult?: unknown
      queuedResultFactory?: (mutationId: string, retained: boolean) => unknown
    }) => Promise.resolve(
      queuedResultFactory?.('mutation-1', false) ?? queuedResult ?? {
        queued: true as const,
        queuedMutationId: 'mutation-1',
      },
    )),
    buildQueuedMutation: vi.fn((options) => ({
      id: 'mutation-1',
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      dependsOn: [],
      lastError: null,
      entityType: null,
      targetEntityId: null,
      clientEntityId: null,
      dedupeKey: null,
      ...options,
    })),
    createQueuedAck: vi.fn((mutationId: string, retained = false) => ({
      queued: true as const,
      queuedMutationId: mutationId,
      ...(retained ? { retained: true as const } : {}),
    })),
    createTempEntityId: vi.fn(() => mocks.state.tempIds.shift() ?? 'offline-habit-fallback'),
    isQueuedResult: vi.fn((value: unknown) => (
      typeof value === 'object' &&
      value !== null &&
      'queued' in value &&
      (value as { queued?: boolean }).queued === true
    )),
    queueOrExecute: vi.fn(),
    OfflineMutationPreflightError,
    withQueuedMarker: vi.fn((value: Record<string, unknown>, mutationId: string) => ({
      ...value,
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    syncWidgetData: vi.fn(async () => {}),
    setLastCreatedHabitId: vi.fn(),
    setStreakCelebration: vi.fn(),
    checkAllDoneCelebration: vi.fn(),
    invalidateHabitMutationQueries: vi.fn(async () => {}),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showUndoToast: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
  focusManager: { setEventListener: () => {} },
  onlineManager: { setEventListener: () => {} },
  QueryClient: class {
    getDefaultOptions() {
      return {}
    }
  },
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}))

vi.mock('@/lib/offline-mutations', () => ({
  runQueuedMutation: mocks.runQueuedMutation,
  buildQueuedMutation: mocks.buildQueuedMutation,
  createQueuedAck: mocks.createQueuedAck,
  createTempEntityId: mocks.createTempEntityId,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
  OfflineMutationPreflightError: mocks.OfflineMutationPreflightError,
  withQueuedMarker: mocks.withQueuedMarker,
}))

vi.mock('@/lib/orbit-widget', () => ({
  syncWidgetData: mocks.syncWidgetData,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: {
    getState: () => ({
      activeFilters: {},
      checkAllDoneCelebration: mocks.checkAllDoneCelebration,
      setStreakCelebration: mocks.setStreakCelebration,
      setLastCreatedHabitId: mocks.setLastCreatedHabitId,
    }),
  },
}))

vi.mock('@/lib/habit-mutation-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/habit-mutation-helpers')>(
    '@/lib/habit-mutation-helpers',
  )

  return {
    ...actual,
    invalidateHabitMutationQueries: mocks.invalidateHabitMutationQueries,
  }
})

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showQueued: vi.fn(),
    showInfo: mocks.showInfo,
    showToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-undo-toast', () => ({
  useUndoToast: () => mocks.showUndoToast,
}))

type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext
  onSuccess?: (data: TResult, variables: TVariables, context: TContext | undefined) => void
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
}

type HabitSnapshotContext = {
  previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
}

type LogHabitSnapshotContext = HabitSnapshotContext & {
  previousLogs: HabitLog[] | undefined
}

type BulkLogOutcome = {
  results: {
    index: number
    habitId: string
    status: 'Success' | 'Failed'
    logId: string | null
    error: string | null
  }[]
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

type LogHabitVariables = {
  habitId: string
  date?: string
  intent: 'log' | 'unlog'
}

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: overrides.id ?? 'habit-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    scheduledDates: overrides.scheduledDates ?? ['2025-01-01'],
    isOverdue: overrides.isOverdue ?? false,
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    slipAlertEnabled: overrides.slipAlertEnabled ?? false,
    tags: overrides.tags ?? [],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    flexibleTarget: overrides.flexibleTarget ?? null,
    flexibleCompleted: overrides.flexibleCompleted ?? null,
    linkedGoals: overrides.linkedGoals ?? [],
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? 'Child task',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? null,
    frequencyQuantity: overrides.frequencyQuantity ?? null,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-15',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    scheduledDates: overrides.scheduledDates ?? ['2025-01-15'],
    isOverdue: overrides.isOverdue ?? false,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    tags: overrides.tags ?? [],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    isLoggedInRange: overrides.isLoggedInRange ?? false,
    instances: overrides.instances ?? [{ date: '2025-01-15', status: 'Pending', logId: null }],
    searchMatches: overrides.searchMatches ?? null,
  }
}

function makeDetail(overrides: Partial<HabitDetail> = {}): HabitDetail {
  const habit = makeHabit()
  return {
    ...habit,
    children: [],
    ...overrides,
  }
}

function seedHabitState(habits: HabitScheduleItem[], count = habits.length): void {
  mocks.state.entries = [
    { key: habitKeys.list({}), value: habits },
    { key: habitKeys.count(), value: count },
    { key: tagKeys.lists(), value: [] },
    { key: goalKeys.lists(), value: [] },
  ]
}

function getHabitList(): HabitScheduleItem[] {
  return (
    mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({})))?.value as HabitScheduleItem[]
  )
}

function getCount(): number {
  return (
    mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.count()))?.value as number
  )
}

describe('mobile habit hooks', () => {
  beforeEach(() => {
    vi.useRealTimers()
    seedHabitState([makeHabit()], 1)
    mocks.state.tempIds = []
    mocks.queryClient.cancelQueries.mockReset()
    mocks.queryClient.cancelQueries.mockImplementation(async () => {})
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueriesData.mockClear()
    mocks.queryClient.setQueriesData.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.runQueuedMutation.mockClear()
    mocks.buildQueuedMutation.mockClear()
    mocks.createQueuedAck.mockClear()
    mocks.createTempEntityId.mockClear()
    mocks.isQueuedResult.mockClear()
    mocks.queueOrExecute.mockReset()
    mocks.withQueuedMarker.mockClear()
    mocks.syncWidgetData.mockClear()
    mocks.setLastCreatedHabitId.mockClear()
    mocks.setStreakCelebration.mockClear()
    mocks.checkAllDoneCelebration.mockClear()
    mocks.invalidateHabitMutationQueries.mockClear()
    mocks.showSuccess.mockClear()
    mocks.showError.mockClear()
    mocks.showUndoToast.mockClear()
    useReviewReminderStore.getState().reset()
  })

  it('gives queued toggles a durable habit and occurrence date key', async () => {
    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >

    await mutation.mutationFn({
      habitId: 'habit-1',
      date: '2026-08-29',
      intent: 'log',
    })

    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({
        type: 'logHabit',
        dedupeKey: 'habit-toggle:habit-1:2026-08-29',
      }),
    }))
  })

  it.each([
    ['log', false],
    ['unlog', true],
  ] as const)('keeps mounted dated detail state optimistic after a queued %s', async (intent, initiallyLogged) => {
    const date = '2025-01-15'
    const initialLog: HabitLog = {
      id: 'server-log-1',
      date,
      value: 1,
      createdAtUtc: '2025-01-15T09:30:00Z',
    }
    const datedHabit = makeHabit({
      dueDate: date,
      scheduledDates: [date],
      isCompleted: initiallyLogged,
      isLoggedInRange: initiallyLogged,
      instances: [{
        date,
        status: initiallyLogged ? 'Completed' : 'Pending',
        logId: initiallyLogged ? initialLog.id : null,
      }],
    })
    const undatedHabit = makeHabit({ ...datedHabit })
    const otherDateHabit = makeHabit({ ...datedHabit })
    mocks.state.entries = [
      { key: habitKeys.list({}), value: [undatedHabit] },
      {
        key: habitKeys.list({ dateFrom: date, dateTo: date }),
        value: [datedHabit],
      },
      {
        key: habitKeys.list({ dateFrom: '2025-01-16', dateTo: '2025-01-16' }),
        value: [otherDateHabit],
      },
      { key: habitKeys.logs('habit-1'), value: initiallyLogged ? [initialLog] : [] },
      { key: habitKeys.count(), value: 1 },
      { key: tagKeys.lists(), value: [] },
      { key: goalKeys.lists(), value: [] },
    ]

    const mutation = useLogHabit() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      LogHabitVariables,
      LogHabitSnapshotContext
    >
    const variables = { habitId: 'habit-1', date, intent }

    const context = await mutation.onMutate?.(variables)
    const response = await mutation.mutationFn(variables)
    mutation.onSuccess?.(response, variables, context)
    mutation.onSettled?.(response, null, variables, context)

    expect(response).toEqual({ queued: true, queuedMutationId: 'mutation-1' })
    const logs = mocks.queryClient.getQueryData(habitKeys.logs('habit-1')) as HabitLog[]
    const completed = intent === 'log'
    expect(isHabitCompletedOnDate(datedHabit, logs, date)).toBe(completed)
    expect(buildHabitHistoryMonth(
      datedHabit,
      logs,
      new Date(2025, 0, 15),
      new Date(2025, 0, 31),
      0,
    ).find((day) => day.dateStr === date)).toMatchObject({
      outcome: completed ? 'full' : 'none',
      loggedAt: completed ? expect.any(String) : null,
    })

    const selectedDateList = mocks.queryClient.getQueryData(
      habitKeys.list({ dateFrom: date, dateTo: date }),
    ) as HabitScheduleItem[]
    expect(selectedDateList[0]).toMatchObject({
      isCompleted: completed,
      isLoggedInRange: completed,
      instances: [{
        date,
        status: completed ? 'Completed' : 'Pending',
        logId: completed ? `optimistic-log:habit-1:${date}` : null,
      }],
    })
    expect(mocks.queryClient.getQueryData(habitKeys.list({}))).toEqual([undatedHabit])
    expect(mocks.queryClient.getQueryData(
      habitKeys.list({ dateFrom: '2025-01-16', dateTo: '2025-01-16' }),
    )).toEqual([otherDateHabit])
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('restores every cache patched by a failed dated log mutation', async () => {
    const date = '2025-01-15'
    const initialLog: HabitLog = {
      id: 'server-log-1',
      date,
      value: 1,
      createdAtUtc: '2025-01-15T09:30:00Z',
    }
    const completedHabit = makeHabit({
      dueDate: date,
      scheduledDates: [date],
      isCompleted: true,
      isLoggedInRange: true,
      instances: [{ date, status: 'Completed', logId: initialLog.id }],
    })
    mocks.state.entries = [
      { key: habitKeys.list({}), value: [completedHabit] },
      {
        key: habitKeys.list({ dateFrom: date, dateTo: date }),
        value: [completedHabit],
      },
      {
        key: habitKeys.list({ dateFrom: '2025-01-01', dateTo: '2025-01-31' }),
        value: [completedHabit],
      },
      { key: habitKeys.logs('habit-1'), value: [initialLog] },
    ]
    const before = structuredClone(mocks.state.entries)
    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      LogHabitSnapshotContext
    >
    const variables = { habitId: 'habit-1', date, intent: 'unlog' as const }

    const context = await mutation.onMutate?.(variables)
    expect(mocks.queryClient.getQueryData(habitKeys.logs('habit-1'))).toEqual([])
    expect(mocks.queryClient.getQueryData(
      habitKeys.list({ dateFrom: date, dateTo: date }),
    )).toEqual([expect.objectContaining({ isCompleted: false, isLoggedInRange: false })])
    expect(mocks.queryClient.getQueryData(
      habitKeys.list({ dateFrom: '2025-01-01', dateTo: '2025-01-31' }),
    )).toEqual([expect.objectContaining({ isCompleted: false, isLoggedInRange: false })])

    mutation.onError?.(new Error('request failed'), variables, context)

    expect(mocks.state.entries).toEqual(before)
  })

  it('tracks every confirmed bulk completion and no requested item before confirmation', async () => {
    seedHabitState(
      [
        makeHabit({ id: 'habit-1', isCompleted: false }),
        makeHabit({ id: 'habit-2', isCompleted: false }),
      ],
      2,
    )
    mocks.runQueuedMutation.mockResolvedValueOnce({
      results: [
        { index: 0, status: 'Success', habitId: 'habit-1', logId: 'log-1', error: null },
        { index: 1, status: 'Success', habitId: 'habit-2', logId: 'log-2', error: null },
      ],
    })

    const mutation = useBulkLogHabits() as unknown as MutationConfig<
      BulkLogOutcome,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const variables = [{ habitId: 'habit-1' }, { habitId: 'habit-2' }]

    const context = await mutation.onMutate?.(variables)
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 0,
      activeDays: [],
    })

    const response = await mutation.mutationFn(variables)
    mutation.onSuccess?.(response, variables, context)

    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 2,
      activeDays: [expect.any(String)],
    })
  })

  it('tracks an incomplete habit when its log is durably queued', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: false })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >

    const variables = {
      habitId: 'habit-1',
      date: '2026-08-28',
      intent: 'log' as const,
    }
    void mutation.onMutate?.(variables)

    expect(useReviewReminderStore.getState().completionCount).toBe(0)

    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'mutation-1' },
      variables,
      undefined,
    )
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 1,
      activeDays: ['2026-08-28'],
    })
  })

  it('does not count a retained acknowledgement and counts a later confirmed log', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: false })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >
    const variables = {
      habitId: 'habit-1',
      date: '2026-08-28',
      intent: 'log' as const,
    }

    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'mutation-1' },
      variables,
      undefined,
    )
    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'mutation-1', retained: true },
      variables,
      undefined,
    )

    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 1,
      activeDays: ['2026-08-28'],
    })

    mutation.onSuccess?.(
      { logId: 'log-2', isFirstCompletionToday: false, currentStreak: 1 },
      variables,
      undefined,
    )

    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 2,
      activeDays: ['2026-08-28'],
    })
  })

  it('does not track a completed habit when its unlog is durably queued', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: true })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >
    const variables = { habitId: 'habit-1', intent: 'unlog' as const }

    void mutation.onMutate?.(variables)
    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'mutation-1' },
      variables,
      undefined,
    )

    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 0,
      activeDays: [],
    })
  })

  it('tracks a confirmed online log exactly once', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: false })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >
    const variables = {
      habitId: 'habit-1',
      date: '2026-08-29',
      intent: 'log' as const,
    }

    void mutation.onMutate?.(variables)
    expect(useReviewReminderStore.getState().completionCount).toBe(0)

    mutation.onSuccess?.(
      { logId: 'log-1', isFirstCompletionToday: false, currentStreak: 1 },
      variables,
      undefined,
    )
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 1,
      activeDays: ['2026-08-29'],
    })
  })

  it('does not track a confirmed online unlog', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: true })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >
    const variables = {
      habitId: 'habit-1',
      date: '2026-08-29',
      intent: 'unlog' as const,
    }

    void mutation.onMutate?.(variables)
    mutation.onSuccess?.(
      { logId: 'log-1', isFirstCompletionToday: false, currentStreak: 0 },
      variables,
      undefined,
    )

    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 0,
      activeDays: [],
    })
  })

  it('optimistically completes before query cancellation resolves', () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: false })], 1)

    let resolveCancel: (() => void) | undefined
    const cancelPromise = new Promise<void>((resolve) => {
      resolveCancel = resolve
    })
    mocks.queryClient.cancelQueries.mockImplementation(() => cancelPromise)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >

    void mutation.onMutate?.({ habitId: 'habit-1', intent: 'log' })

    expect(getHabitList()[0]?.isCompleted).toBe(true)

    resolveCancel?.()
  })

  it('optimistically postpones one-time child skips instead of completing them', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
    seedHabitState([
      makeHabit({
        id: 'parent-1',
        hasSubHabits: true,
        children: [makeChild({ id: 'child-1', frequencyUnit: null })],
      }),
    ], 1)

    const mutation = useSkipHabit() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string },
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >

    await mutation.onMutate?.({ habitId: 'child-1' })

    expect(getHabitList()[0]?.children[0]).toMatchObject({
      isCompleted: false,
      dueDate: '2025-01-16',
      scheduledDates: ['2025-01-16'],
      isOverdue: false,
      instances: [{ date: '2025-01-16', status: 'Pending', logId: null }],
    })

    vi.useRealTimers()
  })

  it('queues an optimistic habit create offline and skips invalidation', async () => {
    mocks.state.entries = [
      { key: habitKeys.list({}), value: [makeHabit()] },
      {
        key: habitKeys.list({ dateFrom: '2025-01-01', dateTo: '2025-01-01' }),
        value: [makeHabit({ id: 'habit-today-1', dueDate: '2025-01-01', scheduledDates: ['2025-01-01'] })],
      },
      { key: habitKeys.count(), value: 2 },
      { key: tagKeys.lists(), value: [] },
      { key: goalKeys.lists(), value: [] },
    ]

    const mutation = useCreateHabit() as unknown as MutationConfig<
      { id: string; queued: true; queuedMutationId: string },
      CreateHabitRequest & { __offlineTempId?: string },
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]; tempId: string }
    >
    const request: CreateHabitRequest & { __offlineTempId?: string } = {
      title: 'Workout',
      frequencyUnit: 'Day',
      dueDate: '2025-01-01',
    }
    mocks.state.tempIds = ['offline-habit-1']

    const context = await mutation.onMutate?.(request)
    const result = await mutation.mutationFn(request)
    mutation.onSuccess?.(result, request, context)
    mutation.onSettled?.(result, null, request, context)

    const list = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({})))?.value as HabitScheduleItem[]
    const todayList = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-01',
    })))?.value as HabitScheduleItem[]
    const count = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.count()))?.value as number
    const optimisticHabit = list.find((habit) => habit.id === 'offline-habit-1')

    expect(request.__offlineTempId).toBe('offline-habit-1')
    expect(list.map((habit) => habit.id)).toEqual(['habit-1', 'offline-habit-1'])
    expect(todayList.map((habit) => habit.id)).toEqual(['habit-today-1', 'offline-habit-1'])
    expect(optimisticHabit).toMatchObject({
      dueDate: '2025-01-01',
      scheduledDates: ['2025-01-01'],
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null }],
    })
    expect(count).toBe(3)
    expect(mocks.setLastCreatedHabitId).toHaveBeenCalledWith('offline-habit-1')
    expect(mocks.invalidateHabitMutationQueries).not.toHaveBeenCalled()
    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({
        type: 'createHabit',
        clientEntityId: 'offline-habit-1',
      }),
      queuedResultFactory: expect.any(Function),
    }))
  })

  it('falls back to today for optimistic offline creates when the payload dueDate is an empty string', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-14T12:00:00Z'))

    try {
      const mutation = useCreateHabit() as unknown as MutationConfig<
        { id: string; queued: true; queuedMutationId: string },
        CreateHabitRequest & { __offlineTempId?: string },
        { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]; tempId: string }
      >
      const request: CreateHabitRequest & { __offlineTempId?: string } = {
        title: 'Offline workout',
        frequencyUnit: 'Day',
        dueDate: '',
      }
      mocks.state.tempIds = ['offline-habit-2']

      const context = await mutation.onMutate?.(request)
      const result = await mutation.mutationFn(request)
      mutation.onSettled?.(result, null, request, context)

      const list = getHabitList()
      const optimisticHabit = list.find((habit) => habit.id === 'offline-habit-2')

      expect(optimisticHabit).toMatchObject({
        dueDate: '2025-02-14',
        scheduledDates: ['2025-02-14'],
        instances: [{ date: '2025-02-14', status: 'Pending', logId: null }],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues a sub-habit under an offline parent with a dependency and optimistic child row', async () => {
    seedHabitState([
      makeHabit({ id: 'offline-parent-1', title: 'Parent', children: [], hasSubHabits: false }),
    ], 1)
    mocks.queryClient.setQueryData(
      habitKeys.detail('offline-parent-1'),
      makeDetail({ id: 'offline-parent-1', title: 'Parent' }),
    )

    const mutation = useCreateSubHabit() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      {
        parentId: string
        data: { title: string; dueDate?: string }
        __offlineTempId?: string
      },
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >
    mocks.state.tempIds = ['offline-habit-child-1']

    const variables: {
      parentId: string
      data: { title: string; dueDate?: string }
      __offlineTempId?: string
    } = {
      parentId: 'offline-parent-1',
      data: { title: 'Warmup' },
    }

    const context = await mutation.onMutate?.(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    const list = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({})))?.value as HabitScheduleItem[]
    const parent = list[0]

    expect(variables.__offlineTempId).toBe('offline-habit-child-1')
    expect(parent?.hasSubHabits).toBe(true)
    expect(parent?.children[0]?.id).toBe('offline-habit-child-1')
    expect(parent?.children[0]).toMatchObject({
      dueDate: '2025-01-01',
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null }],
    })
    expect(
      (mocks.queryClient.getQueryData(habitKeys.detail('offline-parent-1')) as HabitDetail)
        .children[0],
    ).toMatchObject({ id: 'offline-habit-child-1', title: 'Warmup' })
    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({
        type: 'createSubHabit',
        targetEntityId: 'offline-parent-1',
        clientEntityId: 'offline-habit-child-1',
        dependsOn: ['offline-parent-1'],
      }),
    }))
    expect(mocks.invalidateHabitMutationQueries).not.toHaveBeenCalled()
  })

  it('restores checklist state after an optimistic update fails', async () => {
    const originalItems: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    seedHabitState([
      makeHabit({ id: 'habit-1', checklistItems: originalItems }),
    ], 1)

    const mutation = useUpdateChecklist() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; items: ChecklistItem[] },
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >

    const variables = {
      habitId: 'habit-1',
      items: [{ text: 'Step 1', isChecked: true }],
    }

    const context = await mutation.onMutate?.(variables)
    let list = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({})))?.value as HabitScheduleItem[]
    expect(list[0]?.checklistItems).toEqual(variables.items)

    mutation.onError?.(new Error('Checklist failed'), variables, context)

    list = mocks.state.entries.find((entry) => JSON.stringify(entry.key) === JSON.stringify(habitKeys.list({})))?.value as HabitScheduleItem[]
    expect(list[0]?.checklistItems).toEqual(originalItems)
  })

  it('optimistically updates the detail and fullDetail caches when present', async () => {
    const originalItems: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    const newItems: ChecklistItem[] = [{ text: 'Step 1', isChecked: true }]
    seedHabitState([
      makeHabit({ id: 'habit-1', checklistItems: originalItems }),
    ], 1)

    mocks.queryClient.setQueryData(habitKeys.detail('habit-1'), {
      id: 'habit-1',
      title: 'Test',
      checklistItems: originalItems,
    })
    mocks.queryClient.setQueryData(habitKeys.fullDetail('habit-1'), {
      habit: {
        id: 'habit-1',
        title: 'Test',
        checklistItems: originalItems,
      },
      metrics: null,
      logs: [],
    })

    const mutation = useUpdateChecklist() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; items: ChecklistItem[] },
      {
        previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
        previousDetail: { checklistItems: ChecklistItem[] } | undefined
        previousFullDetail: { habit: { checklistItems: ChecklistItem[] } } | undefined
      }
    >

    const variables = { habitId: 'habit-1', items: newItems }
    const context = await mutation.onMutate?.(variables)

    const detail = mocks.queryClient.getQueryData(habitKeys.detail('habit-1')) as {
      checklistItems: ChecklistItem[]
    } | undefined
    const full = mocks.queryClient.getQueryData(habitKeys.fullDetail('habit-1')) as {
      habit: { checklistItems: ChecklistItem[] }
    } | undefined
    expect(detail?.checklistItems).toEqual(newItems)
    expect(full?.habit.checklistItems).toEqual(newItems)
    expect(context?.previousDetail?.checklistItems).toEqual(originalItems)
    expect(context?.previousFullDetail?.habit.checklistItems).toEqual(originalItems)

    mutation.onError?.(new Error('boom'), variables, context)
    const detailAfter = mocks.queryClient.getQueryData(habitKeys.detail('habit-1')) as {
      checklistItems: ChecklistItem[]
    }
    const fullAfter = mocks.queryClient.getQueryData(habitKeys.fullDetail('habit-1')) as {
      habit: { checklistItems: ChecklistItem[] }
    }
    expect(detailAfter.checklistItems).toEqual(originalItems)
    expect(fullAfter.habit.checklistItems).toEqual(originalItems)
  })

  it('keeps queued inline schedule and text updates in the detail cache', async () => {
    seedHabitState([makeHabit({ id: 'habit-1', title: 'Old title' })], 1)
    mocks.queryClient.setQueryData(habitKeys.detail('habit-1'), {
      ...makeHabit({ id: 'habit-1', title: 'Old title' }),
      children: [],
    })
    const mutation = useUpdateHabit() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; data: UpdateHabitRequest },
      unknown
    >

    await mutation.onMutate?.({
      habitId: 'habit-1',
      data: { title: 'New title', frequencyUnit: 'Week', frequencyQuantity: 2 },
    })

    expect(mocks.queryClient.getQueryData(habitKeys.detail('habit-1'))).toMatchObject({
      title: 'New title',
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
    })
  })

  it('optimistically moves a habit under a new parent and restores the tree on failure', async () => {
    seedHabitState([
      makeHabit({ id: 'offline-parent-1', title: 'Parent', children: [], hasSubHabits: false, position: 0 }),
      makeHabit({ id: 'habit-1', title: 'Mover', position: 1 }),
    ], 2)

    const mutation = useMoveHabitParent() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; data: { parentId: string | null } },
      { previousLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
    >

    const variables = {
      habitId: 'habit-1',
      data: { parentId: 'offline-parent-1' },
    }
    const context = await mutation.onMutate?.(variables)
    let list = getHabitList()
    const parentAfterMove = list[0]

    expect(list.map((habit) => habit.id)).toEqual(['offline-parent-1'])
    expect(parentAfterMove?.hasSubHabits).toBe(true)
    expect(parentAfterMove?.children.map((child) => child.id)).toEqual(['habit-1'])
    expect(parentAfterMove?.children[0]?.position).toBe(0)

    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({
        type: 'moveHabitParent',
        targetEntityId: 'offline-parent-1',
        dependsOn: ['offline-parent-1'],
      }),
    }))
    expect(mocks.invalidateHabitMutationQueries).not.toHaveBeenCalled()

    mutation.onError?.(new Error('Move failed'), variables, context)

    list = getHabitList()
    expect(list.map((habit) => habit.id)).toEqual(['offline-parent-1', 'habit-1'])
    expect(list[0]?.hasSubHabits).toBe(false)
    expect(list[0]?.children).toEqual([])
  })

  it('shows the undo snackbar when a habit delete succeeds', () => {
    const mutation = useDeleteHabit() as unknown as MutationConfig<unknown, string, undefined>

    mutation.onSuccess?.(undefined, 'habit-1', undefined)

    expect(mocks.showUndoToast).toHaveBeenCalledWith('undo.habitDeleted', expect.any(Function))
  })

  it('restores a habit through the queued path, targets the restore endpoint, and confirms', async () => {
    mocks.runQueuedMutation.mockResolvedValueOnce({})

    const mutation = useRestoreHabit() as unknown as MutationConfig<unknown, string, undefined>

    const result = await mutation.mutationFn('habit-1')
    mutation.onSuccess?.(result, 'habit-1', undefined)
    mutation.onSettled?.(result, null, 'habit-1', undefined)

    expect(mocks.runQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      mutation: expect.objectContaining({
        type: 'restoreHabit',
        endpoint: API.habits.restore('habit-1'),
        method: 'POST',
      }),
    }))
    expect(mocks.showSuccess).toHaveBeenCalledWith('undo.restored')
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
  })

  it('surfaces an error toast when a habit restore fails', () => {
    const mutation = useRestoreHabit() as unknown as MutationConfig<unknown, string, undefined>

    mutation.onError?.(new Error('boom'), 'habit-1', undefined)

    expect(mocks.showError).toHaveBeenCalledWith('undo.restoreFailed')
  })

  it('applies streak, profile, gamification, and linked-goal updates on a fresh online completion', () => {
    mocks.state.entries = [
      { key: habitKeys.list({}), value: [makeHabit({ id: 'habit-1', isBadHabit: false })] },
      { key: habitKeys.count(), value: 1 },
      { key: tagKeys.lists(), value: [] },
      {
        key: goalKeys.lists(),
        value: [createMockGoal({ id: 'goal-1', currentValue: 0, targetValue: 10, progressPercentage: 0 })],
      },
      { key: profileKeys.detail(), value: { currentStreak: 0, hasCompletedOnboarding: true } },
      { key: gamificationKeys.profile(), value: { totalXp: 100 } },
    ]

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >
    const response: LogHabitResponse = {
      logId: 'log-1',
      isFirstCompletionToday: true,
      currentStreak: 3,
      xpEarned: 25,
      linkedGoalUpdates: [{ goalId: 'goal-1', title: 'Read 12 Books', newProgress: 4, targetValue: 10 }],
      newAchievementIds: [],
    }

    mutation.onSuccess?.(response, { habitId: 'habit-1', intent: 'log' }, undefined)

    expect(mocks.setStreakCelebration).toHaveBeenCalledWith({ streak: 3 })
    const profile = mocks.queryClient.getQueryData(profileKeys.detail()) as { currentStreak: number }
    expect(profile.currentStreak).toBe(3)
    const goal = (mocks.queryClient.getQueryData(goalKeys.lists()) as Goal[])[0]
    expect(goal?.currentValue).toBe(4)
    expect(goal?.progressPercentage).toBe(40)
    const gamification = mocks.queryClient.getQueryData(gamificationKeys.profile()) as { totalXp: number }
    expect(gamification.totalXp).toBe(125)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
    expect(mocks.checkAllDoneCelebration).toHaveBeenCalled()
  })

  it('refreshes mounted detail data after an explicit-date completion', () => {
    seedHabitState([makeHabit({ id: 'habit-1' })])
    const mutation = useLogHabit() as unknown as MutationConfig<
      LogHabitResponse,
      LogHabitVariables,
      unknown
    >
    const response: LogHabitResponse = {
      logId: 'log-1',
      isFirstCompletionToday: false,
      currentStreak: 1,
    }

    mutation.onSettled?.(
      response,
      null,
      { habitId: 'habit-1', intent: 'log', date: '2025-01-15' },
      undefined,
    )

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.logs('habit-1'),
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.metrics('habit-1'),
    })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  /**
   * `xpEarned` is 0 here because that is what the server actually sends for a bad habit:
   * GamificationService.cs:170 is `habit.IsBadHabit ? 0 : ...`. The fixture used to send 25, a
   * response the API cannot produce, and the client then needed its own bad-habit gate to discard
   * it. That gate is what dropped every reward for a habit missing from the list cache.
   */
  it('does not celebrate a bad sub-habit completion, and the server sends it no XP', () => {
    seedHabitState([makeHabit({
      id: 'parent-1',
      children: [makeChild({ id: 'bad-child', isBadHabit: true })],
    })])
    mocks.queryClient.setQueryData(profileKeys.detail(), { currentStreak: 1 })
    mocks.queryClient.setQueryData(gamificationKeys.profile(), { totalXp: 100 })
    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >
    const response: LogHabitResponse = {
      logId: 'log-streak',
      isFirstCompletionToday: true,
      currentStreak: 3,
      xpEarned: 0,
    }

    mutation.onSuccess?.(response, { habitId: 'bad-child', intent: 'log' }, undefined)

    expect(mocks.setStreakCelebration).not.toHaveBeenCalled()
    const profile = mocks.queryClient.getQueryData(profileKeys.detail()) as { currentStreak: number }
    expect(profile.currentStreak).toBe(1)
    const gamification = mocks.queryClient.getQueryData(gamificationKeys.profile()) as { totalXp: number }
    expect(gamification.totalXp).toBe(100)
  })

  /**
   * THE defect the connector found on #699, mirrored from web for parity. Rewards the server
   * already granted were discarded whenever the habit was absent from the list cache, which is the
   * ordinary state on a deep link or a cold navigation.
   */
  it('banks XP and refreshes achievements for a habit that is not in the list cache', () => {
    seedHabitState([makeHabit({ id: 'cached-habit' })])
    mocks.queryClient.setQueryData(profileKeys.detail(), { currentStreak: 1 })
    mocks.queryClient.setQueryData(gamificationKeys.profile(), { totalXp: 100 })
    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >
    const response: LogHabitResponse = {
      logId: 'log-uncached',
      isFirstCompletionToday: true,
      currentStreak: 3,
      xpEarned: 25,
      newAchievementIds: ['first-week'],
    }

    mutation.onSuccess?.(response, { habitId: 'never-listed', intent: 'log' }, undefined)

    const gamification = mocks.queryClient.getQueryData(gamificationKeys.profile()) as { totalXp: number }
    expect(gamification.totalXp).toBe(125)
    /** The celebration still needs a KNOWN good habit, because an unresolvable one could be a bad
     * habit whose "streak" is abstinence. Reconciling is safe; celebrating on a guess is not. */
    expect(mocks.setStreakCelebration).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'does not celebrate a bad top-level habit completion',
      habits: [makeHabit({ id: 'bad-habit', isBadHabit: true })],
      habitId: 'bad-habit',
      isFirstCompletionToday: true,
      celebrates: false,
    },
    {
      name: 'celebrates a good top-level habit completion',
      habits: [makeHabit({ id: 'good-habit' })],
      habitId: 'good-habit',
      isFirstCompletionToday: true,
      celebrates: true,
    },
    {
      name: 'celebrates a good sub-habit completion',
      habits: [makeHabit({
        id: 'parent-1',
        children: [makeChild({ id: 'good-child' })],
      })],
      habitId: 'good-child',
      isFirstCompletionToday: true,
      celebrates: true,
    },
    {
      name: 'does not celebrate an unresolvable habit completion',
      habits: [makeHabit({ id: 'cached-habit' })],
      habitId: 'missing-habit',
      isFirstCompletionToday: true,
      celebrates: false,
    },
    {
      name: 'does not celebrate a repeat completion',
      habits: [makeHabit({ id: 'good-habit' })],
      habitId: 'good-habit',
      isFirstCompletionToday: false,
      celebrates: false,
    },
  ])('$name', ({ habits, habitId, isFirstCompletionToday, celebrates }) => {
    seedHabitState(habits)
    mocks.queryClient.setQueryData(profileKeys.detail(), { currentStreak: 1 })
    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >
    const response: LogHabitResponse = {
      logId: 'log-streak',
      isFirstCompletionToday,
      currentStreak: 3,
    }

    mutation.onSuccess?.(response, { habitId, intent: 'log' }, undefined)

    if (celebrates) {
      expect(mocks.setStreakCelebration).toHaveBeenCalledWith({ streak: 3 })
    } else {
      expect(mocks.setStreakCelebration).not.toHaveBeenCalled()
    }
    const profile = mocks.queryClient.getQueryData(profileKeys.detail()) as { currentStreak: number }
    expect(profile.currentStreak).toBe(celebrates ? 3 : 1)
  })

  it('skips all celebrations when a completion is queued offline', () => {
    seedHabitState([makeHabit({ id: 'habit-1' })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      unknown
    >

    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'm-1' },
      { habitId: 'habit-1', intent: 'log' },
      undefined,
    )

    expect(mocks.setStreakCelebration).not.toHaveBeenCalled()
    expect(mocks.checkAllDoneCelebration).not.toHaveBeenCalled()
    expect(mocks.showInfo).toHaveBeenCalledWith('todayAstra.offlineLog')
  })

  it('rolls back the optimistic completion when logging fails', async () => {
    seedHabitState([makeHabit({ id: 'habit-1', isCompleted: false })], 1)

    const mutation = useLogHabit() as unknown as MutationConfig<
      unknown,
      LogHabitVariables,
      HabitSnapshotContext
    >

    const variables = { habitId: 'habit-1', intent: 'log' as const }
    const context = await mutation.onMutate?.(variables)
    expect(getHabitList()[0]?.isCompleted).toBe(true)

    mutation.onError?.(new Error('Log failed'), variables, context)
    expect(getHabitList()[0]?.isCompleted).toBe(false)
  })

  it('optimistically completes a recurring skip and rolls it back on failure', async () => {
    seedHabitState([makeHabit({ id: 'habit-1', frequencyUnit: 'Day', isCompleted: false })], 1)

    const mutation = useSkipHabit() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string },
      HabitSnapshotContext
    >

    const context = await mutation.onMutate?.({ habitId: 'habit-1' })
    expect(getHabitList()[0]?.isCompleted).toBe(true)

    mutation.onError?.(new Error('Skip failed'), { habitId: 'habit-1' }, context)
    expect(getHabitList()[0]?.isCompleted).toBe(false)
  })

  it('patches a habit optimistically, invalidates its detail online, and restores it on failure', async () => {
    seedHabitState([makeHabit({ id: 'habit-1', title: 'Exercise' })], 1)

    const mutation = useUpdateHabit() as unknown as MutationConfig<
      unknown,
      { habitId: string; data: { title: string; isBadHabit: boolean } },
      HabitSnapshotContext
    >
    const variables = { habitId: 'habit-1', data: { title: 'Run 5k', isBadHabit: false } }

    const context = await mutation.onMutate?.(variables)
    expect(getHabitList()[0]?.title).toBe('Run 5k')

    mocks.runQueuedMutation.mockResolvedValueOnce({})
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.detail('habit-1'),
    })

    mutation.onError?.(new Error('Update failed'), variables, context)
    expect(getHabitList()[0]?.title).toBe('Exercise')
  })

  it('reorders habit positions optimistically and restores them on failure', async () => {
    seedHabitState(
      [
        makeHabit({ id: 'habit-1', position: 0 }),
        makeHabit({ id: 'habit-2', position: 1 }),
      ],
      2,
    )

    const mutation = useReorderHabits() as unknown as MutationConfig<
      unknown,
      { positions: { habitId: string; position: number }[] },
      HabitSnapshotContext
    >
    const variables = {
      positions: [
        { habitId: 'habit-1', position: 1 },
        { habitId: 'habit-2', position: 0 },
      ],
    }

    const context = await mutation.onMutate?.(variables)
    const byId = (id: string) => getHabitList().find((habit) => habit.id === id)
    expect(byId('habit-1')?.position).toBe(1)
    expect(byId('habit-2')?.position).toBe(0)

    mutation.onError?.(new Error('Reorder failed'), variables, context)
    expect(byId('habit-1')?.position).toBe(0)
    expect(byId('habit-2')?.position).toBe(1)
  })

  it('optimistically deletes a habit, decrements the count, and restores both on failure', async () => {
    seedHabitState([makeHabit({ id: 'habit-1' }), makeHabit({ id: 'habit-2' })], 2)

    const mutation = useDeleteHabit() as unknown as MutationConfig<
      unknown,
      string,
      HabitSnapshotContext
    >

    const context = await mutation.onMutate?.('habit-1')
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-2'])
    expect(getCount()).toBe(1)

    mutation.onError?.(new Error('Delete failed'), 'habit-1', context)
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1', 'habit-2'])
    expect(getCount()).toBe(2)
  })

  it('removes a queued child from the mounted detail tree and restores it on failure', async () => {
    seedHabitState([
      makeHabit({ id: 'parent-1', children: [makeChild({ id: 'child-1' })] }),
    ], 2)
    const originalDetail = makeDetail({
      id: 'parent-1',
      children: [makeChild({ id: 'child-1' })],
    })
    mocks.queryClient.setQueryData(habitKeys.detail('parent-1'), originalDetail)
    const mutation = useDeleteHabit() as unknown as MutationConfig<
      unknown,
      string,
      HabitSnapshotContext & {
        previousDetails: readonly (readonly [readonly unknown[], HabitDetail | undefined])[]
      }
    >

    const context = await mutation.onMutate?.('child-1')
    expect(
      (mocks.queryClient.getQueryData(habitKeys.detail('parent-1')) as HabitDetail).children,
    ).toEqual([])

    mutation.onError?.(new Error('Delete failed'), 'child-1', context)
    expect(
      (mocks.queryClient.getQueryData(habitKeys.detail('parent-1')) as HabitDetail).children,
    ).toHaveLength(1)
  })

  it('inserts an optimistic duplicate with an incremented count and rolls back on failure', async () => {
    seedHabitState([makeHabit({ id: 'habit-1', title: 'Exercise' })], 1)
    mocks.state.tempIds = ['offline-dup-1']

    const mutation = useDuplicateHabit() as unknown as MutationConfig<
      unknown,
      string,
      { previousLists: HabitSnapshotContext['previousLists']; tempId: string | null }
    >

    const context = await mutation.onMutate?.('habit-1')
    const duplicate = getHabitList().find((habit) => habit.id === 'offline-dup-1')
    expect(duplicate?.title).toBe('Exercise')
    expect(getCount()).toBe(2)
    expect(context?.tempId).toBe('offline-dup-1')

    mutation.onError?.(new Error('Duplicate failed'), 'habit-1', context)
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1'])
    expect(getCount()).toBe(1)
  })

  it('skips the optimistic duplicate when the source habit is missing from the cache', async () => {
    seedHabitState([makeHabit({ id: 'habit-1' })], 1)

    const mutation = useDuplicateHabit() as unknown as MutationConfig<
      unknown,
      string,
      { previousLists: HabitSnapshotContext['previousLists']; tempId: string | null }
    >

    const context = await mutation.onMutate?.('missing-habit')
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1'])
    expect(getCount()).toBe(1)
    expect(context?.tempId).toBeNull()
  })

  it('inserts a batch of optimistic habits and rolls the whole batch back on failure', async () => {
    seedHabitState([makeHabit({ id: 'habit-1' })], 1)

    const mutation = useBulkCreateHabits() as unknown as MutationConfig<
      unknown,
      { habits: { title: string }[]; __offlineTempIds?: string[] },
      { previousLists: HabitSnapshotContext['previousLists']; createdCount: number }
    >
    mocks.state.tempIds = ['offline-bulk-1', 'offline-bulk-2']
    const variables = { habits: [{ title: 'Read' }, { title: 'Meditate' }] }

    const context = await mutation.onMutate?.(variables)
    expect(getHabitList().map((habit) => habit.title)).toEqual(['Exercise', 'Read', 'Meditate'])
    expect(getCount()).toBe(3)
    expect(context?.createdCount).toBe(2)

    mutation.onError?.(new Error('Bulk create failed'), variables, context)
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1'])
    expect(getCount()).toBe(1)
  })

  it('optimistically deletes many habits while leaving the count to the server', async () => {
    seedHabitState(
      [
        makeHabit({ id: 'habit-1' }),
        makeHabit({ id: 'habit-2' }),
        makeHabit({ id: 'habit-3' }),
      ],
      3,
    )

    const mutation = useBulkDeleteHabits() as unknown as MutationConfig<
      unknown,
      string[],
      { previousLists: HabitSnapshotContext['previousLists'] }
    >

    const context = await mutation.onMutate?.(['habit-1', 'habit-2'])
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-3'])
    expect(getCount()).toBe(3)

    mocks.runQueuedMutation.mockResolvedValueOnce({ results: [] })
    const result = await mutation.mutationFn(['habit-1', 'habit-2'])
    mutation.onSettled?.(result, null, ['habit-1', 'habit-2'], context)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.count() })

    mutation.onError?.(new Error('Bulk delete failed'), ['habit-1', 'habit-2'], context)
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1', 'habit-2', 'habit-3'])
    expect(getCount()).toBe(3)
  })

  it('feeds every non-idempotent bulk mutation through a blocked mutation type', async () => {
    const bulkDelete = useBulkDeleteHabits() as unknown as MutationConfig<
      unknown,
      string[],
      HabitSnapshotContext
    >
    const bulkLog = useBulkLogHabits() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const bulkSkip = useBulkSkipHabits() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >

    await bulkDelete.mutationFn(['habit-1'])
    await bulkLog.mutationFn([{ habitId: 'habit-1' }])
    await bulkSkip.mutationFn([{ habitId: 'habit-1' }])

    expect(mocks.runQueuedMutation.mock.calls.map(([options]) => options.mutation.type)).toEqual([
      'bulkCascadeDeleteHabits',
      'bulkLogHabits',
      'bulkSkipHabits',
    ])
  })

  it('restores every bulk optimistic update after an offline refusal without changing reminders', async () => {
    seedHabitState([
      makeHabit({ id: 'habit-1', isCompleted: false }),
      makeHabit({ id: 'habit-2', isCompleted: false }),
    ], 2)

    const bulkDelete = useBulkDeleteHabits() as unknown as MutationConfig<
      { results: unknown[]; ambiguousIds: string[]; offlineFailureIds: string[] },
      string[],
      { previousLists: HabitSnapshotContext['previousLists'] }
    >
    const deleteVariables = ['habit-1', 'habit-2']
    const deleteContext = await bulkDelete.onMutate?.(deleteVariables)
    mocks.runQueuedMutation
      .mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
      .mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    const deleteResult = await bulkDelete.mutationFn(deleteVariables)
    bulkDelete.onSuccess?.(deleteResult, deleteVariables, deleteContext)

    expect(deleteResult.offlineFailureIds).toEqual(deleteVariables)
    expect(deleteResult.ambiguousIds).toEqual([])
    expect(getHabitList().map((habit) => habit.id)).toEqual(['habit-1', 'habit-2'])
    expect(getCount()).toBe(2)

    const bulkLog = useBulkLogHabits() as unknown as MutationConfig<
      { results: unknown[]; ambiguousIds: string[]; offlineFailureIds: string[] },
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const logVariables = [{ habitId: 'habit-1' }, { habitId: 'habit-2' }]
    const logContext = await bulkLog.onMutate?.(logVariables)
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 0,
      activeDays: [],
    })
    mocks.runQueuedMutation.mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    const logResult = await bulkLog.mutationFn(logVariables)
    bulkLog.onSuccess?.(logResult, logVariables, logContext)

    expect(logResult.offlineFailureIds).toEqual(['habit-1', 'habit-2'])
    expect(logResult.ambiguousIds).toEqual([])
    expect(getHabitList().every((habit) => !habit.isCompleted)).toBe(true)
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 0,
      activeDays: [],
    })

    const bulkSkip = useBulkSkipHabits() as unknown as MutationConfig<
      { results: unknown[]; ambiguousIds: string[]; offlineFailureIds: string[] },
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const skipVariables = [{ habitId: 'habit-1' }, { habitId: 'habit-2' }]
    const skipContext = await bulkSkip.onMutate?.(skipVariables)
    mocks.runQueuedMutation.mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    const skipResult = await bulkSkip.mutationFn(skipVariables)
    bulkSkip.onSuccess?.(skipResult, skipVariables, skipContext)

    expect(skipResult.offlineFailureIds).toEqual(['habit-1', 'habit-2'])
    expect(skipResult.ambiguousIds).toEqual([])
    expect(getHabitList().every((habit) => !habit.isCompleted)).toBe(true)
  })

  it('keeps every post-send bulk failure ambiguous and refreshes the list', async () => {
    seedHabitState([
      makeHabit({ id: 'habit-1', isCompleted: false }),
      makeHabit({ id: 'habit-2', isCompleted: false }),
    ], 2)

    const deleteVariables = ['habit-1', 'habit-2']
    const bulkDelete = useBulkDeleteHabits() as unknown as MutationConfig<
      { results: unknown[]; ambiguousIds: string[]; offlineFailureIds: string[] },
      string[],
      { previousLists: HabitSnapshotContext['previousLists'] }
    >
    const deleteContext = await bulkDelete.onMutate?.(deleteVariables)
    mocks.runQueuedMutation
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
    const deleteResult = await bulkDelete.mutationFn(deleteVariables)
    bulkDelete.onSuccess?.(deleteResult, deleteVariables, deleteContext)
    bulkDelete.onSettled?.(deleteResult, null, deleteVariables, deleteContext)

    expect(deleteResult).toEqual({
      results: [],
      ambiguousIds: deleteVariables,
      offlineFailureIds: [],
    })
    expect(getHabitList()).toEqual([])

    seedHabitState([
      makeHabit({ id: 'habit-1', isCompleted: false }),
      makeHabit({ id: 'habit-2', isCompleted: false }),
    ], 2)
    const logVariables = [{ habitId: 'habit-1' }, { habitId: 'habit-2' }]
    const bulkLog = useBulkLogHabits() as unknown as MutationConfig<
      BulkLogOutcome,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const logContext = await bulkLog.onMutate?.(logVariables)
    mocks.runQueuedMutation.mockRejectedValueOnce(new TypeError('Network request failed'))
    const logResult = await bulkLog.mutationFn(logVariables)
    bulkLog.onSuccess?.(logResult, logVariables, logContext)
    bulkLog.onSettled?.(logResult, null, logVariables, logContext)

    expect(logResult).toEqual({
      results: [],
      ambiguousIds: ['habit-1', 'habit-2'],
      offlineFailureIds: [],
    })
    expect(getHabitList().every((habit) => habit.isCompleted)).toBe(true)
    expect(useReviewReminderStore.getState().completionCount).toBe(0)

    seedHabitState([
      makeHabit({ id: 'habit-1', isCompleted: false }),
      makeHabit({ id: 'habit-2', isCompleted: false }),
    ], 2)
    const skipVariables = [{ habitId: 'habit-1' }, { habitId: 'habit-2' }]
    const bulkSkip = useBulkSkipHabits() as unknown as MutationConfig<
      { results: unknown[]; ambiguousIds: string[]; offlineFailureIds: string[] },
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const skipContext = await bulkSkip.onMutate?.(skipVariables)
    mocks.runQueuedMutation.mockRejectedValueOnce(new TypeError('Network request failed'))
    const skipResult = await bulkSkip.mutationFn(skipVariables)
    bulkSkip.onSuccess?.(skipResult, skipVariables, skipContext)
    bulkSkip.onSettled?.(skipResult, null, skipVariables, skipContext)

    expect(skipResult).toEqual({
      results: [],
      ambiguousIds: ['habit-1', 'habit-2'],
      offlineFailureIds: [],
    })
    expect(getHabitList().every((habit) => habit.isCompleted)).toBe(true)
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
  })

  it('optimistically completes dated and undated bulk skips and restores them on failure', async () => {
    seedHabitState(
      [
        makeHabit({ id: 'habit-1', isCompleted: false }),
        makeHabit({ id: 'habit-2', isCompleted: false }),
      ],
      2,
    )

    const mutation = useBulkSkipHabits() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const variables = [
      { habitId: 'habit-1' },
      { habitId: 'habit-2', date: '2025-02-01' },
    ]

    const context = await mutation.onMutate?.(variables)
    expect(getHabitList().find((habit) => habit.id === 'habit-1')?.isCompleted).toBe(true)
    expect(getHabitList().find((habit) => habit.id === 'habit-2')?.isCompleted).toBe(true)

    mutation.onError?.(new Error('Bulk skip failed'), variables, context)
    expect(getHabitList().find((habit) => habit.id === 'habit-1')?.isCompleted).toBe(false)
  })

  it('restores only the rejected sibling after a mixed bulk skip result', async () => {
    seedHabitState([
      makeHabit({
        id: 'parent',
        hasSubHabits: true,
        children: [
          makeChild({ id: 'child-accepted', isCompleted: false }),
          makeChild({ id: 'child-rejected', isCompleted: false }),
        ],
      }),
    ], 3)
    const mutation = useBulkSkipHabits() as unknown as MutationConfig<
      { results: { index: number; status: 'Success' | 'Failed'; habitId: string; error: string | null }[] },
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const variables = [
      { habitId: 'child-accepted' },
      { habitId: 'child-rejected' },
    ]
    const mixedResult = {
      results: [
        { index: 0, status: 'Success' as const, habitId: 'child-accepted', error: null },
        { index: 1, status: 'Failed' as const, habitId: 'child-rejected', error: 'Rejected' },
      ],
    }
    mocks.runQueuedMutation.mockResolvedValueOnce(mixedResult)

    const context = await mutation.onMutate?.(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSuccess?.(result, variables, context)

    const children = getHabitList()[0]?.children
    expect(children?.find((habit) => habit.id === 'child-accepted')?.isCompleted).toBe(true)
    expect(children?.find((habit) => habit.id === 'child-rejected')?.isCompleted).toBe(false)
  })

  it('restores the list when a bulk log fails', async () => {
    seedHabitState(
      [
        makeHabit({ id: 'habit-1', isCompleted: false }),
        makeHabit({ id: 'habit-2', isCompleted: false }),
      ],
      2,
    )

    const mutation = useBulkLogHabits() as unknown as MutationConfig<
      unknown,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const variables = [
      { habitId: 'habit-1' },
      { habitId: 'habit-2', date: '2025-02-01' },
    ]

    const context = await mutation.onMutate?.(variables)
    expect(getHabitList().every((habit) => habit.isCompleted)).toBe(true)

    mutation.onError?.(new Error('Bulk log failed'), variables, context)
    expect(getHabitList().every((habit) => habit.isCompleted)).toBe(false)
  })

  it('restores only the rejected sibling after a mixed bulk log result', async () => {
    seedHabitState([
      makeHabit({
        id: 'parent',
        hasSubHabits: true,
        children: [
          makeChild({ id: 'child-accepted', isCompleted: false }),
          makeChild({ id: 'child-rejected', isCompleted: false }),
        ],
      }),
    ], 3)
    const mutation = useBulkLogHabits() as unknown as MutationConfig<
      BulkLogOutcome,
      { habitId: string; date?: string }[],
      HabitSnapshotContext
    >
    const variables = [
      { habitId: 'child-accepted', date: '2026-08-28' },
      { habitId: 'child-rejected', date: '2026-08-29' },
    ]
    const mixedResult = {
      results: [
        { index: 0, status: 'Success' as const, habitId: 'child-accepted', logId: 'log-1', error: null },
        { index: 1, status: 'Failed' as const, habitId: 'child-rejected', logId: null, error: 'Rejected' },
      ],
    }
    mocks.runQueuedMutation.mockResolvedValueOnce(mixedResult)

    const context = await mutation.onMutate?.(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSuccess?.(result, variables, context)

    const children = getHabitList()[0]?.children
    expect(children?.find((habit) => habit.id === 'child-accepted')?.isCompleted).toBe(true)
    expect(children?.find((habit) => habit.id === 'child-rejected')?.isCompleted).toBe(false)
    expect(useReviewReminderStore.getState()).toMatchObject({
      completionCount: 1,
      activeDays: ['2026-08-28'],
    })
  })
})
