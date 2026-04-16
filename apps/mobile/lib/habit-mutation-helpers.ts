import type { QueryClient } from '@tanstack/react-query'
import {
  gamificationKeys,
  goalKeys,
  habitKeys,
  profileKeys,
  tagKeys,
} from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import type {
  CreateHabitRequest,
  CreateSubHabitRequest,
  HabitScheduleChild,
  HabitScheduleItem,
  MoveHabitParentRequest,
  UpdateHabitRequest,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import { isQueuedResult } from '@/lib/offline-mutations'
import { refreshWidget } from '@/lib/orbit-widget'

interface CachedTag {
  id: string
  name: string
  color: string
}

export function snapshotHabitLists(queryClient: QueryClient) {
  return queryClient.getQueriesData<HabitScheduleItem[]>({
    queryKey: habitKeys.lists(),
  })
}

export function restoreHabitLists(
  queryClient: QueryClient,
  snapshots: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>,
): void {
  for (const [key, data] of snapshots) {
    if (data) {
      queryClient.setQueryData(key, data)
    }
  }
}

export function updateHabitLists(
  queryClient: QueryClient,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  queryClient.setQueriesData<HabitScheduleItem[]>(
    { queryKey: habitKeys.lists() },
    (old) => (old ? updater(old) : old),
  )
}

export function adjustHabitCount(queryClient: QueryClient, delta: number): void {
  queryClient.setQueryData<number>(habitKeys.count(), (old) => {
    if (old === undefined) return old
    return Math.max(0, old + delta)
  })
}

type HabitTreeNode = HabitScheduleItem | HabitScheduleChild
type HabitPatch = Partial<HabitScheduleItem>

function cloneChildHabit(node: HabitTreeNode): HabitScheduleChild {
  const children = node.children.map((child) => cloneChildHabit(child))

  return {
    id: node.id,
    title: node.title,
    description: node.description,
    frequencyUnit: node.frequencyUnit,
    frequencyQuantity: node.frequencyQuantity,
    isBadHabit: node.isBadHabit,
    isCompleted: node.isCompleted,
    isGeneral: node.isGeneral,
    isFlexible: node.isFlexible,
    days: node.days,
    dueDate: node.dueDate,
    dueTime: node.dueTime,
    dueEndTime: node.dueEndTime,
    endDate: node.endDate,
    position: node.position,
    checklistItems: node.checklistItems,
    tags: node.tags,
    children,
    hasSubHabits: children.length > 0 || node.hasSubHabits,
    isLoggedInRange: 'isLoggedInRange' in node ? node.isLoggedInRange : false,
    instances: 'instances' in node ? node.instances : [],
    searchMatches: node.searchMatches ?? null,
  }
}

function cloneTopLevelHabit(node: HabitTreeNode): HabitScheduleItem {
  const children = node.children.map((child) => cloneChildHabit(child))

  return {
    id: node.id,
    title: node.title,
    description: node.description,
    frequencyUnit: node.frequencyUnit,
    frequencyQuantity: node.frequencyQuantity,
    isBadHabit: node.isBadHabit,
    isCompleted: node.isCompleted,
    isGeneral: node.isGeneral,
    isFlexible: node.isFlexible,
    days: node.days,
    dueDate: node.dueDate,
    dueTime: node.dueTime,
    dueEndTime: node.dueEndTime,
    endDate: node.endDate,
    position: node.position,
    checklistItems: node.checklistItems,
    createdAtUtc: 'createdAtUtc' in node ? node.createdAtUtc : new Date().toISOString(),
    scheduledDates: 'scheduledDates' in node ? node.scheduledDates : [],
    isOverdue: 'isOverdue' in node ? node.isOverdue : false,
    reminderEnabled: 'reminderEnabled' in node ? node.reminderEnabled : false,
    reminderTimes: 'reminderTimes' in node ? node.reminderTimes : [],
    scheduledReminders: 'scheduledReminders' in node ? node.scheduledReminders : [],
    slipAlertEnabled: 'slipAlertEnabled' in node ? node.slipAlertEnabled : false,
    tags: node.tags,
    children,
    hasSubHabits: children.length > 0 || node.hasSubHabits,
    flexibleTarget: 'flexibleTarget' in node ? node.flexibleTarget : null,
    flexibleCompleted: 'flexibleCompleted' in node ? node.flexibleCompleted : null,
    linkedGoals: 'linkedGoals' in node ? node.linkedGoals : undefined,
    instances: 'instances' in node ? node.instances : [],
    searchMatches: node.searchMatches ?? null,
  }
}

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

function findHabitParentId(
  items: HabitScheduleItem[],
  habitId: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const item of items) {
    if (item.id === habitId) return parentId

    const nested = findHabitParentIdInChildren(item.children, habitId, item.id)
    if (nested !== undefined) return nested
  }

  return undefined
}

function findHabitParentIdInChildren(
  children: HabitScheduleChild[],
  habitId: string,
  parentId: string,
): string | null | undefined {
  for (const child of children) {
    if (child.id === habitId) return parentId

    const nested = findHabitParentIdInChildren(child.children, habitId, child.id)
    if (nested !== undefined) return nested
  }

  return undefined
}

function containsHabitId(node: HabitTreeNode, habitId: string): boolean {
  if (node.id === habitId) return true

  return node.children.some((child) => containsHabitId(child, habitId))
}

function reindexChildHabits(children: HabitScheduleChild[]): HabitScheduleChild[] {
  return children.map((child, index) => {
    const nextChildren = reindexChildHabits(child.children)

    return {
      ...child,
      position: index,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function reindexTopLevelHabits(items: HabitScheduleItem[]): HabitScheduleItem[] {
  return items.map((item, index) => {
    const nextChildren = reindexChildHabits(item.children)

    return {
      ...item,
      position: index,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function extractHabitFromChildren(
  children: HabitScheduleChild[],
  habitId: string,
): { children: HabitScheduleChild[]; removed: HabitTreeNode | null } {
  let removed: HabitTreeNode | null = null

  const nextChildren = children.flatMap((child) => {
    if (child.id === habitId) {
      removed = child
      return []
    }

    const nested = extractHabitFromChildren(child.children, habitId)
    if (nested.removed) {
      removed = nested.removed
    }

    return [{
      ...child,
      children: nested.children,
      hasSubHabits: nested.children.length > 0,
    }]
  })

  return { children: nextChildren, removed }
}

function extractHabitFromItems(
  items: HabitScheduleItem[],
  habitId: string,
): { items: HabitScheduleItem[]; removed: HabitTreeNode | null } {
  let removed: HabitTreeNode | null = null

  const nextItems = items.flatMap((item) => {
    if (item.id === habitId) {
      removed = item
      return []
    }

    const nested = extractHabitFromChildren(item.children, habitId)
    if (nested.removed) {
      removed = nested.removed
    }

    return [{
      ...item,
      children: nested.children,
      hasSubHabits: nested.children.length > 0,
    }]
  })

  return { items: nextItems, removed }
}

function insertHabitIntoChildren(
  children: HabitScheduleChild[],
  parentId: string,
  habit: HabitScheduleChild,
): HabitScheduleChild[] {
  return children.map((child) => {
    if (child.id === parentId) {
      return {
        ...child,
        children: [...child.children, habit],
        hasSubHabits: true,
      }
    }

    const nextChildren = insertHabitIntoChildren(child.children, parentId, habit)
    return {
      ...child,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function insertHabitIntoItems(
  items: HabitScheduleItem[],
  parentId: string,
  habit: HabitScheduleChild,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === parentId) {
      return {
        ...item,
        children: [...item.children, habit],
        hasSubHabits: true,
      }
    }

    const nextChildren = insertHabitIntoChildren(item.children, parentId, habit)
    return {
      ...item,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

export function optimisticMoveHabitParent(
  items: HabitScheduleItem[],
  habitId: string,
  parentId: MoveHabitParentRequest['parentId'],
): HabitScheduleItem[] {
  const currentParentId = findHabitParentId(items, habitId)
  if (currentParentId === undefined || currentParentId === parentId) {
    return items
  }

  const sourceNode = findHabitNode(items, habitId)
  if (!sourceNode) return items

  if (parentId !== null) {
    const targetNode = findHabitNode(items, parentId)
    if (!targetNode || containsHabitId(sourceNode, parentId)) {
      return items
    }
  }

  const extracted = extractHabitFromItems(items, habitId)
  if (!extracted.removed) return items

  if (parentId === null) {
    return reindexTopLevelHabits([
      ...extracted.items,
      cloneTopLevelHabit(extracted.removed),
    ])
  }

  const nextItems = insertHabitIntoItems(
    extracted.items,
    parentId,
    cloneChildHabit(extracted.removed),
  )

  return reindexTopLevelHabits(nextItems)
}

function findCachedGoals(
  queryClient: QueryClient,
  goalIds: string[] | undefined,
): Array<{ id: string; title: string }> {
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
  const dueDate = data.dueDate || formatAPIDate(now)
  const hasScheduleInstance = !data.isGeneral && dueDate.length > 0

  return {
    id: tempId,
    title: data.title,
    description: data.description ?? null,
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
    position: getNextTopLevelPosition(queryClient),
    checklistItems: data.checklistItems ?? [],
    createdAtUtc: now.toISOString(),
    scheduledDates: data.isGeneral ? [] : [dueDate],
    isOverdue: false,
    reminderEnabled: data.reminderEnabled ?? false,
    reminderTimes: data.reminderTimes ?? [],
    scheduledReminders: data.scheduledReminders ?? [],
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
      title: `${source.title} Copy`,
      description: source.description ?? undefined,
      frequencyUnit: source.frequencyUnit ?? undefined,
      frequencyQuantity: source.frequencyQuantity ?? undefined,
      days: source.days,
      isBadHabit: source.isBadHabit,
      isGeneral: source.isGeneral,
      isFlexible: source.isFlexible,
      dueDate: source.dueDate,
      dueTime: source.dueTime ?? undefined,
      dueEndTime: source.dueEndTime ?? undefined,
      reminderEnabled: 'reminderEnabled' in source ? source.reminderEnabled : undefined,
      reminderTimes: 'reminderTimes' in source ? source.reminderTimes : undefined,
      scheduledReminders: 'scheduledReminders' in source ? source.scheduledReminders : undefined,
      slipAlertEnabled: 'slipAlertEnabled' in source ? source.slipAlertEnabled : undefined,
      checklistItems: source.checklistItems,
      tagIds: source.tags.map((tag) => tag.id),
      endDate: source.endDate ?? undefined,
    }),
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
  setHabitPatchField(patch, data, 'endDate', 'endDate', data.endDate ?? null)
  if (data.clearEndDate) patch.endDate = null

  if (data.isGeneral) {
    patch.frequencyUnit = null
    patch.frequencyQuantity = null
    patch.days = []
    patch.reminderEnabled = false
    patch.reminderTimes = []
    patch.scheduledReminders = []
    patch.dueTime = null
    patch.dueEndTime = null
    patch.endDate = null
  }

  return patch
}

function runBackgroundInvalidations(tasks: Array<Promise<unknown>>) {
  void Promise.allSettled(tasks)
}

export function invalidateHabitMutationQueries(
  queryClient: QueryClient,
  options?: {
    habitId?: string
    includeGoals?: boolean
    includeGamification?: boolean
    includeProfile?: boolean
  },
): void {
  const invalidations: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() }),
  ]

  if (options?.habitId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(options.habitId) }),
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

export function finalizeHabitMutation(
  queryClient: QueryClient,
  data: unknown,
  error: Error | null,
  options?: {
    habitId?: string
    includeGoals?: boolean
    includeGamification?: boolean
    includeProfile?: boolean
  },
): void {
  if (error || isQueuedResult(data)) {
    return
  }

  invalidateHabitMutationQueries(queryClient, options)
  void refreshWidget().catch(() => {})
}
