import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys, goalKeys, tagKeys } from '@orbit/shared/query'
import type { ChecklistItem, CreateHabitRequest, HabitScheduleItem } from '@orbit/shared/types/habit'

const mocks = vi.hoisted(() => {
  const state = {
    entries: [] as Array<{ key: readonly unknown[]; value: unknown }>,
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
      updater: unknown | ((old: unknown) => unknown),
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
      updater: unknown | ((old: unknown) => unknown),
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
    runQueuedMutation: vi.fn(async ({ queuedResult, queuedResultFactory }: {
      queuedResult?: unknown
      queuedResultFactory?: (mutationId: string) => unknown
    }) => (
      queuedResultFactory?.('mutation-1') ?? queuedResult ?? {
        queued: true as const,
        queuedMutationId: 'mutation-1',
      }
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
    createQueuedAck: vi.fn((mutationId: string) => ({
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    createTempEntityId: vi.fn(() => mocks.state.tempIds.shift() ?? 'offline-habit-fallback'),
    isQueuedResult: vi.fn((value: unknown) => (
      typeof value === 'object' &&
      value !== null &&
      'queued' in value &&
      (value as { queued?: boolean }).queued === true
    )),
    queueOrExecute: vi.fn(),
    withQueuedMarker: vi.fn((value: Record<string, unknown>, mutationId: string) => ({
      ...value,
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    refreshWidget: vi.fn(async () => {}),
    setLastCreatedHabitId: vi.fn(),
    invalidateHabitMutationQueries: vi.fn(async () => {}),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  runQueuedMutation: mocks.runQueuedMutation,
  buildQueuedMutation: mocks.buildQueuedMutation,
  createQueuedAck: mocks.createQueuedAck,
  createTempEntityId: mocks.createTempEntityId,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
  withQueuedMarker: mocks.withQueuedMarker,
}))

vi.mock('@/lib/orbit-widget', () => ({
  refreshWidget: mocks.refreshWidget,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: {
    getState: () => ({
      activeFilters: {},
      checkAllDoneCelebration: vi.fn(),
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

import {
  useCreateHabit,
  useCreateSubHabit,
  useMoveHabitParent,
  useUpdateChecklist,
} from '@/hooks/use-habits'

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

describe('mobile habit hooks', () => {
  beforeEach(() => {
    seedHabitState([makeHabit()], 1)
    mocks.state.tempIds = []
    mocks.queryClient.cancelQueries.mockClear()
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
    mocks.refreshWidget.mockClear()
    mocks.setLastCreatedHabitId.mockClear()
    mocks.invalidateHabitMutationQueries.mockClear()
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
      { previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>; tempId: string }
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
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null, note: null }],
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
        { previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>; tempId: string }
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
        instances: [{ date: '2025-02-14', status: 'Pending', logId: null, note: null }],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues a sub-habit under an offline parent with a dependency and optimistic child row', async () => {
    seedHabitState([
      makeHabit({ id: 'offline-parent-1', title: 'Parent', children: [], hasSubHabits: false }),
    ], 1)

    const mutation = useCreateSubHabit() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      {
        parentId: string
        data: { title: string; dueDate?: string }
        __offlineTempId?: string
      },
      { previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]> }
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
      instances: [{ date: '2025-01-01', status: 'Pending', logId: null, note: null }],
    })
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
      { previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]> }
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

  it('optimistically moves a habit under a new parent and restores the tree on failure', async () => {
    seedHabitState([
      makeHabit({ id: 'offline-parent-1', title: 'Parent', children: [], hasSubHabits: false, position: 0 }),
      makeHabit({ id: 'habit-1', title: 'Mover', position: 1 }),
    ], 2)

    const mutation = useMoveHabitParent() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; data: { parentId: string | null } },
      { previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]> }
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
})
