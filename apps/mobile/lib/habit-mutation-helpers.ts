import type { HabitListKey, HabitListSnapshots } from '@orbit/shared/query'
import type { QueryClient } from '@tanstack/react-query'
import {
  gamificationKeys,
  goalKeys,
  habitKeys,
  profileKeys,
  restoreCachedHabitLists,
  tagKeys,
  updateCachedHabitLists,
  updateHabitListsForDate as updateCachedHabitListsForDate,
} from '@orbit/shared/query'
import { findHabitInList, formatAPIDate, optimisticPatchHabit } from '@orbit/shared/utils'
import type {
  CreateHabitRequest,
  CreateSubHabitRequest,
  HabitScheduleChild,
  HabitScheduleItem,
  UpdateHabitRequest,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import { isQueuedResult } from '@/lib/offline-mutations'
import { syncWidgetData } from '@/lib/orbit-widget'

interface CachedTag {
  id: string
  name: string
  color: string
}

export function snapshotHabitLists(queryClient: QueryClient): HabitListSnapshots {
  return queryClient.getQueriesData<HabitScheduleItem[]>({
    queryKey: habitKeys.lists(),
  }).filter((entry): entry is [HabitListKey, HabitScheduleItem[] | undefined] => entry[0][0] === 'habits' && entry[0][1] === 'list')
}

export function restoreHabitLists(
  queryClient: QueryClient,
  snapshots: HabitListSnapshots,
): void {
  restoreCachedHabitLists(queryClient, snapshots)
}

export function restoreHabitCompletionForIds(
  queryClient: QueryClient,
  snapshots: HabitListSnapshots,
  habitIds: ReadonlySet<string>,
): void {
  for (const [key, snapshot] of snapshots) {
    if (!snapshot) continue
    queryClient.setQueryData<HabitScheduleItem[]>(key, (current) => {
      if (!current) return current
      let restored = current
      for (const habitId of habitIds) {
        const previousHabit = findHabitInList(snapshot, habitId)
        if (previousHabit) {
          restored = optimisticPatchHabit(restored, habitId, {
            isCompleted: previousHabit.isCompleted,
          })
        }
      }
      return restored
    })
  }
}

export function updateHabitLists(
  queryClient: QueryClient,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  updateCachedHabitLists(queryClient, updater)
}

export function updateHabitListsForDate(...parameters: Parameters<typeof updateCachedHabitListsForDate>): void {
  updateCachedHabitListsForDate(...parameters)
}

export function adjustHabitCount(queryClient: QueryClient, delta: number): void {
  queryClient.setQueryData<number>(habitKeys.count(), (old) => {
    if (old === undefined) return old
    return Math.max(0, old + delta)
  })
}

type HabitTreeNode = HabitScheduleItem | HabitScheduleChild
type HabitPatch = Partial<HabitScheduleItem>

function findHabitNode(
  items: HabitScheduleItem[],
  habitId: string,
): HabitTreeNode | null {
  const searchChildren = (children: HabitScheduleChild[]): HabitTreeNode | null => {
    for (const child of children) {
      if (child.id === habitId) return child
      const nested = searchChildren(child.children)
      if (nested) return nested
    }

    return null
  }

  for (const item of items) {
    if (item.id === habitId) return item
    const nested = searchChildren(item.children)
    if (nested) return nested
  }

  return null
}

function setHabitPatchField<
  TDataKey extends keyof UpdateHabitRequest,
  TPatchKey extends keyof HabitScheduleItem,
>(
  patch: HabitPatch,
  data: UpdateHabitRequest,
  dataKey: TDataKey,
  patchKey: TPatchKey,
  value: HabitScheduleItem[TPatchKey],
): void {
  if (dataKey in data) {
    patch[patchKey] = value
  }
}

function findCachedGoals(
  queryClient: QueryClient,
  goalIds: string[] | undefined,
): { id: string; title: string }[] {
  if (!goalIds?.length) return []

  const goals = queryClient
    .getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
    .flatMap(([, data]) => data ?? [])

  const goalMap = new Map(goals.map((goal) => [goal.id, goal]))

  return goalIds
    .map((goalId) => {
      const goal = goalMap.get(goalId)
      return goal ? { id: goal.id, title: goal.title } : null
    })
    .filter((goal): goal is { id: string; title: string } => goal !== null)
}

function findCachedTags(
  queryClient: QueryClient,
  tagIds: string[] | undefined,
): CachedTag[] {
  if (!tagIds?.length) return []

  const tags = queryClient
    .getQueriesData<CachedTag[]>({ queryKey: tagKeys.lists() })
    .flatMap(([, data]) => data ?? [])

  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))

  return tagIds
    .map((tagId) => tagMap.get(tagId) ?? null)
    .filter((tag): tag is CachedTag => tag !== null)
}

function getNextTopLevelPosition(queryClient: QueryClient): number {
  let maxPosition = -1

  for (const [, items] of queryClient.getQueriesData<HabitScheduleItem[]>({
    queryKey: habitKeys.lists(),
  })) {
    for (const item of items ?? []) {
      if (item.position !== null) {
        maxPosition = Math.max(maxPosition, item.position)
      }
    }
  }

  return maxPosition + 1
}

export function buildOptimisticHabit(
  queryClient: QueryClient,
  tempId: string,
  data: CreateHabitRequest,
): HabitScheduleItem {
  const now = new Date()
  const dueDate = data.startDate || data.dueDate || formatAPIDate(now)
  const hasScheduleInstance = !data.isGeneral && dueDate.length > 0

  return {
    id: tempId,
    title: data.title,
    description: data.description ?? null,
    emoji: data.emoji ?? null,
    frequencyUnit: data.frequencyUnit ?? null,
    frequencyQuantity: data.frequencyQuantity ?? null,
    isBadHabit: data.isBadHabit ?? false,
    isCompleted: false,
    isGeneral: data.isGeneral ?? false,
    isFlexible: data.isFlexible ?? false,
    days: data.days ?? [],
    dueDate,
    dueTime: data.dueTime ?? null,
    dueEndTime: data.dueEndTime ?? null,
    endDate: data.endDate ?? null,
    startDate: data.startDate,
    position: getNextTopLevelPosition(queryClient),
    checklistItems: data.checklistItems ?? [],
    createdAtUtc: now.toISOString(),
    scheduledDates: data.isGeneral ? [] : [dueDate],
    isOverdue: false,
    reminderEnabled: data.reminderEnabled ?? false,
    reminderTimes: data.reminderTimes ?? [],
    scheduledReminders: data.scheduledReminders ?? [],
    relativeReminders: data.relativeReminders ?? [],
    slipAlertEnabled: data.slipAlertEnabled ?? false,
    tags: findCachedTags(queryClient, data.tagIds),
    children: [],
    hasSubHabits: (data.subHabits?.length ?? 0) > 0,
    flexibleTarget: null,
    flexibleCompleted: null,
    linkedGoals: findCachedGoals(queryClient, data.goalIds),
    instances: hasScheduleInstance
      ? [{ date: dueDate, status: 'Pending', logId: null }]
      : [],
    searchMatches: null,
  }
}

export function buildOptimisticSubHabit(
  queryClient: QueryClient,
  parentId: string,
  tempId: string,
  data: CreateSubHabitRequest,
): HabitScheduleChild {
  const parentItems = queryClient
    .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    .flatMap(([, items]) => items ?? [])
  const parent = findHabitNode(parentItems, parentId)
  const now = new Date()
  const dueDate = data.dueDate || parent?.dueDate || formatAPIDate(now)

  return {
    id: tempId,
    title: data.title,
    description: data.description ?? null,
    emoji: data.emoji ?? null,
    frequencyUnit: data.frequencyUnit ?? null,
    frequencyQuantity: data.frequencyQuantity ?? null,
    isBadHabit: data.isBadHabit ?? false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: data.isFlexible ?? false,
    days: data.days ?? [],
    dueDate,
    dueTime: data.dueTime ?? null,
    dueEndTime: data.dueEndTime ?? null,
    endDate: data.endDate ?? null,
    position: parent?.children.length ?? 0,
    checklistItems: data.checklistItems ?? [],
    tags: findCachedTags(queryClient, data.tagIds),
    children: [],
    hasSubHabits: false,
    isLoggedInRange: false,
    scheduledDates: [dueDate],
    isOverdue: false,
    instances: [{ date: dueDate, status: 'Pending', logId: null }],
    searchMatches: null,
  }
}

export function buildOptimisticDuplicateHabit(
  queryClient: QueryClient,
  habitId: string,
  tempId: string,
): HabitScheduleItem | null {
  const allItems = queryClient
    .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    .flatMap(([, items]) => items ?? [])
  const source = findHabitNode(allItems, habitId)
  if (!source) return null

  const now = new Date().toISOString()

  return {
    ...buildOptimisticHabit(queryClient, tempId, {
      title: source.title,
      description: source.description ?? undefined,
      emoji: source.emoji ?? undefined,
      frequencyUnit: source.frequencyUnit ?? undefined,
      frequencyQuantity: source.frequencyQuantity ?? undefined,
      days: source.days,
      isBadHabit: source.isBadHabit,
      isGeneral: source.isGeneral,
      isFlexible: source.isFlexible,
      dueDate: source.dueDate,
      dueTime: source.dueTime ?? undefined,
      dueEndTime: source.dueEndTime ?? undefined,
      reminderEnabled: source.reminderEnabled ?? undefined,
      reminderTimes: source.reminderTimes ?? undefined,
      scheduledReminders: source.scheduledReminders ?? undefined,
      relativeReminders: 'relativeReminders' in source ? source.relativeReminders ?? undefined : undefined,
      slipAlertEnabled: source.slipAlertEnabled ?? undefined,
      checklistItems: source.checklistItems,
      tagIds: source.tags.map((tag) => tag.id),
      endDate: source.endDate ?? undefined,
    }),
    isCompleted: !source.frequencyUnit && source.isCompleted,
    createdAtUtc: now,
  }
}

export function buildOptimisticHabitPatch(
  queryClient: QueryClient,
  data: UpdateHabitRequest,
): Partial<HabitScheduleItem> {
  const patch: HabitPatch = {
    title: data.title,
    isBadHabit: data.isBadHabit,
  }

  setHabitPatchField(patch, data, 'description', 'description', data.description ?? null)
  setHabitPatchField(patch, data, 'emoji', 'emoji', data.emoji ?? null)
  setHabitPatchField(patch, data, 'isGeneral', 'isGeneral', data.isGeneral ?? false)
  setHabitPatchField(patch, data, 'isFlexible', 'isFlexible', data.isFlexible ?? false)
  setHabitPatchField(patch, data, 'frequencyUnit', 'frequencyUnit', data.frequencyUnit ?? null)
  setHabitPatchField(
    patch,
    data,
    'frequencyQuantity',
    'frequencyQuantity',
    data.frequencyQuantity ?? null,
  )
  setHabitPatchField(patch, data, 'days', 'days', data.days ?? [])
  setHabitPatchField(patch, data, 'startDate', 'startDate', data.startDate)
  setHabitPatchField(patch, data, 'dueDate', 'dueDate', data.dueDate ?? '')
  setHabitPatchField(patch, data, 'dueTime', 'dueTime', data.dueTime ?? null)
  setHabitPatchField(patch, data, 'dueEndTime', 'dueEndTime', data.dueEndTime ?? null)
  setHabitPatchField(
    patch,
    data,
    'reminderEnabled',
    'reminderEnabled',
    data.reminderEnabled ?? false,
  )
  setHabitPatchField(patch, data, 'reminderTimes', 'reminderTimes', data.reminderTimes ?? [])
  setHabitPatchField(
    patch,
    data,
    'scheduledReminders',
    'scheduledReminders',
    data.scheduledReminders ?? [],
  )
  setHabitPatchField(
    patch,
    data,
    'relativeReminders',
    'relativeReminders',
    data.relativeReminders ?? [],
  )
  setHabitPatchField(
    patch,
    data,
    'slipAlertEnabled',
    'slipAlertEnabled',
    data.slipAlertEnabled ?? false,
  )
  setHabitPatchField(
    patch,
    data,
    'checklistItems',
    'checklistItems',
    data.checklistItems ?? [],
  )
  setHabitPatchField(
    patch,
    data,
    'goalIds',
    'linkedGoals',
    findCachedGoals(queryClient, data.goalIds),
  )
  if (data.tagIds != null) patch.tags = findCachedTags(queryClient, data.tagIds)
  setHabitPatchField(patch, data, 'endDate', 'endDate', data.endDate ?? null)
  if (data.clearEndDate) patch.endDate = null

  if (data.isGeneral) {
    patch.frequencyUnit = null
    patch.frequencyQuantity = null
    patch.days = []
    patch.reminderEnabled = false
    patch.reminderTimes = []
    patch.scheduledReminders = []
    patch.relativeReminders = []
    patch.dueTime = null
    patch.dueEndTime = null
    patch.endDate = null
  }

  return patch
}

function runBackgroundInvalidations(tasks: Promise<unknown>[]) {
  void Promise.allSettled(tasks)
}

interface HabitInvalidationOptions {
  habitId?: string
  includeGoals?: boolean
  includeGamification?: boolean
  includeProfile?: boolean
  includeLists?: boolean
  includeCount?: boolean
}

export function invalidateHabitMutationQueries(
  queryClient: QueryClient,
  options?: HabitInvalidationOptions,
): void {
  const invalidations: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() }),
    /**
     * The mounted summary MUST refetch, so this cannot narrow to `refetchType: 'none'`. `useSummary`
     * disables focus refetching and holds a 5 minute `staleTime`, so marking the query stale without
     * refetching leaves the Today Astra card describing the pre-completion state until its next time
     * bucket. Parity with `apps/web/hooks/use-habits.ts`.
     */
    queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() }),
    queryClient.invalidateQueries({ queryKey: habitKeys.retrospectivePrefix() }),
    queryClient.invalidateQueries({ queryKey: gamificationKeys.recapPrefix() }),
  ]

  if (options?.includeLists !== false) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: habitKeys.lists() }))
  }
  invalidations.push(queryClient.invalidateQueries({ queryKey: habitKeys.searches() }))

  if (options?.includeCount !== false) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: habitKeys.count() }))
  }

  if (options?.habitId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(options.habitId) }),
      queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(options.habitId) }),
      queryClient.invalidateQueries({ queryKey: habitKeys.logs(options.habitId) }),
      queryClient.invalidateQueries({ queryKey: habitKeys.metrics(options.habitId) }),
    )
  }

  if (options?.includeGoals) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: goalKeys.lists() }))
  }

  if (options?.includeProfile) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: profileKeys.all }))
  }

  if (options?.includeGamification) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gamificationKeys.all }))
  }

  runBackgroundInvalidations(invalidations)
}

export function discardCachedHabitSearches(queryClient: QueryClient): void {
  const filters = { queryKey: habitKeys.searches() }
  for (const query of queryClient.getQueryCache().findAll(filters)) query.reset()
  queryClient.removeQueries(filters)
}

export function finalizeHabitMutation(
  queryClient: QueryClient,
  data: unknown,
  error: Error | null,
  options?: HabitInvalidationOptions,
): void {
  if (isQueuedResult(data)) {
    discardCachedHabitSearches(queryClient)
    void queryClient.invalidateQueries({
      queryKey: habitKeys.calendarPrefix(),
      refetchType: 'none',
    })
    return
  }

  invalidateHabitMutationQueries(queryClient, options)
  void syncWidgetData().catch(() => {})
}

export { optimisticMoveHabitParent } from '@orbit/shared/utils'
