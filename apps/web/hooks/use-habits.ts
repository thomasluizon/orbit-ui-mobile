'use client'

import { useMemo, useCallback } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { formatAPIDate } from '@orbit/shared/utils'
import type {
  HabitsFilter,
  HabitScheduleItem,
  HabitScheduleChild,
  NormalizedHabit,
  PaginatedResponse,
  HabitDetail,
  HabitMetrics,
  HabitFullDetail,
  LogHabitResponse,
  CreateHabitRequest,
  UpdateHabitRequest,
  ReorderHabitsRequest,
  ChecklistItem,
  CreateSubHabitRequest,
  MoveHabitParentRequest,
  BulkCreateRequest,
  BulkCreateResponse,
  BulkDeleteResponse,
  BulkLogItemRequest,
  BulkLogResult,
  BulkSkipItemRequest,
  BulkSkipResult,
} from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'
import {
  createHabit as createHabitAction,
  updateHabit as updateHabitAction,
  deleteHabit as deleteHabitAction,
  logHabit as logHabitAction,
  skipHabit as skipHabitAction,
  reorderHabits as reorderHabitsAction,
  duplicateHabit as duplicateHabitAction,
  updateChecklist as updateChecklistAction,
  createSubHabit as createSubHabitAction,
  moveHabitParent as moveHabitParentAction,
  bulkCreateHabits as bulkCreateHabitsAction,
  bulkDeleteHabits as bulkDeleteHabitsAction,
  bulkLogHabits as bulkLogHabitsAction,
  bulkSkipHabits as bulkSkipHabitsAction,
} from '@/app/actions/habits'
import { useUIStore } from '@/stores/ui-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQueryString(filters: HabitsFilter): string {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.append('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.append('dateTo', filters.dateTo)
  if (filters.includeOverdue) params.append('includeOverdue', 'true')
  if (filters.isGeneral) params.append('isGeneral', 'true')
  if (filters.includeGeneral) params.append('includeGeneral', 'true')
  if (filters.search) params.append('search', filters.search)
  if (filters.isCompleted !== undefined) params.append('isCompleted', String(filters.isCompleted))
  if (filters.frequencyUnit) params.append('frequencyUnit', filters.frequencyUnit)
  // .NET expects repeated params: tagIds=a&tagIds=b (not comma-separated)
  if (filters.tagIds?.length) {
    for (const tagId of filters.tagIds) {
      params.append('tagIds', tagId)
    }
  }
  if (filters.page) params.append('page', String(filters.page))
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize))
  return params.toString()
}

function buildUrl(base: string, qs: string): string {
  return qs ? `${base}?${qs}` : base
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

// Sort by position asc (nulls last), then createdAtUtc as tiebreaker
function sortByPosition(a: NormalizedHabit, b: NormalizedHabit): number {
  if (a.position !== null && b.position !== null) {
    const diff = a.position - b.position
    if (diff !== 0) return diff
  }
  if (a.position !== null && b.position === null) return -1
  if (a.position === null && b.position !== null) return 1
  return a.createdAtUtc.localeCompare(b.createdAtUtc)
}

// Normalize children recursively into a flat map
function normalizeChildren(
  children: HabitScheduleChild[],
  parentId: string,
  rootItem: HabitScheduleItem,
  map: Map<string, NormalizedHabit>,
) {
  const todayStr = formatAPIDate(new Date())
  for (const child of children) {
    const { children: grandchildren, ...childData } = child
    map.set(child.id, {
      ...childData,
      createdAtUtc: rootItem.createdAtUtc,
      parentId,
      position: child.position ?? null,
      scheduledDates: [],
      isOverdue:
        !child.isCompleted &&
        !child.frequencyUnit &&
        !!child.dueDate &&
        child.dueDate < todayStr,
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      slipAlertEnabled: false,
      hasSubHabits: child.hasSubHabits ?? grandchildren.length > 0,
      flexibleTarget: null,
      flexibleCompleted: null,
      isLoggedInRange: child.isLoggedInRange ?? false,
      instances: child.instances ?? [],
      searchMatches: child.searchMatches ?? null,
    })

    if (grandchildren && grandchildren.length > 0) {
      normalizeChildren(grandchildren, child.id, rootItem, map)
    }
  }
}

// Normalize a full page of schedule items into a flat Map
function normalizeHabits(
  allItems: HabitScheduleItem[],
): Map<string, NormalizedHabit> {
  const map = new Map<string, NormalizedHabit>()

  for (const item of allItems) {
    const { children, ...parentData } = item
    map.set(item.id, {
      ...parentData,
      parentId: null,
      position: item.position ?? null,
      hasSubHabits: item.hasSubHabits,
      flexibleTarget: item.flexibleTarget ?? null,
      flexibleCompleted: item.flexibleCompleted ?? null,
      isLoggedInRange: false,
      instances: item.instances ?? [],
      searchMatches: item.searchMatches ?? null,
    })

    if (children && children.length > 0) {
      normalizeChildren(children, item.id, item, map)
    }
  }

  return map
}

// Build parentId -> child ids index
function buildChildrenIndex(habitsById: Map<string, NormalizedHabit>): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const habit of habitsById.values()) {
    if (habit.parentId !== null) {
      const siblings = index.get(habit.parentId)
      if (siblings) {
        siblings.push(habit.id)
      } else {
        index.set(habit.parentId, [habit.id])
      }
    }
  }
  return index
}

// ---------------------------------------------------------------------------
// Normalized data type returned from select
// ---------------------------------------------------------------------------

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

// ---------------------------------------------------------------------------
// Habits list query
// ---------------------------------------------------------------------------

export function useHabits(filters: HabitsFilter) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: habitKeys.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<HabitScheduleItem[]> => {
      const qs = buildQueryString(filters)
      const url = buildUrl(API.habits.list, qs)
      const data = await fetchJson<PaginatedResponse<HabitScheduleItem>>(url)

      const allItems = [...data.items]

      // For dateless queries (all view), fetch remaining pages in parallel
      if (!filters.dateFrom && data.totalPages > 1) {
        const pagePromises: Promise<PaginatedResponse<HabitScheduleItem>>[] = []
        for (let p = 2; p <= data.totalPages; p++) {
          const pageFilters = { ...filters, page: p }
          const pageQs = buildQueryString(pageFilters)
          const pageUrl = buildUrl(API.habits.list, pageQs)
          pagePromises.push(fetchJson<PaginatedResponse<HabitScheduleItem>>(pageUrl))
        }
        const pages = await Promise.all(pagePromises)
        for (const pageData of pages) {
          allItems.push(...pageData.items)
        }
      }

      return allItems
    },
    staleTime: QUERY_STALE_TIMES.habits,
    select: (items): NormalizedHabitsData => {
      const habitsById = normalizeHabits(items)
      const childrenByParent = buildChildrenIndex(habitsById)
      const topLevelHabits = Array.from(habitsById.values())
        .filter((h) => h.parentId === null)
        .sort(sortByPosition)

      return {
        habitsById,
        childrenByParent,
        topLevelHabits,
        totalCount: items.length,
        totalPages: 1,
        currentPage: 1,
      }
    },
  })

  // Utility: get sorted children for a parent
  const getChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      const data = query.data
      if (!data) return []
      const ids = data.childrenByParent.get(parentId) ?? []
      return ids
        .map((id) => data.habitsById.get(id))
        .filter((h): h is NormalizedHabit => h !== undefined)
        .sort(sortByPosition)
    },
    [query.data],
  )

  return {
    ...query,
    getChildren,
  }
}

// ---------------------------------------------------------------------------
// Single habit detail query
// ---------------------------------------------------------------------------

export function useHabitDetail(id: string | null) {
  return useQuery({
    queryKey: habitKeys.detail(id ?? ''),
    queryFn: () => fetchJson<HabitDetail>(API.habits.get(id ?? "")),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

// ---------------------------------------------------------------------------
// Habit metrics query
// ---------------------------------------------------------------------------

export function useHabitMetrics(id: string | null) {
  const query = useQuery({
    queryKey: habitKeys.metrics(id ?? ''),
    queryFn: () => fetchJson<HabitMetrics>(API.habits.metrics(id ?? "")),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })

  const weeklyPercentage = query.data?.weeklyCompletionRate ?? 0
  const monthlyPercentage = query.data?.monthlyCompletionRate ?? 0

  return {
    ...query,
    weeklyPercentage,
    monthlyPercentage,
  }
}

// ---------------------------------------------------------------------------
// Habit logs query
// ---------------------------------------------------------------------------

export function useHabitLogs(id: string | null) {
  return useQuery({
    queryKey: habitKeys.logs(id ?? ''),
    queryFn: () => fetchJson<HabitLog[]>(`${API.habits.get(id ?? "")}/logs`),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

// ---------------------------------------------------------------------------
// Habit full detail (habit + metrics + logs)
// ---------------------------------------------------------------------------

export function useHabitFullDetail(id: string | null) {
  return useQuery({
    queryKey: habitKeys.detail(id ?? ''),
    queryFn: () => fetchJson<HabitFullDetail>(API.habits.detail(id ?? "")),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useMutation({
    mutationFn: ({
      habitId,
      note,
      date,
    }: {
      habitId: string
      note?: string
      date?: string
    }) => logHabitAction(habitId, note || date ? { note, date } : undefined),

    onMutate: async ({ habitId, date }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      // Snapshot all list queries for rollback
      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      // Optimistic toggle: find the habit in any list cache and flip isCompleted
      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => {
            if (!old) return old
            return old.map((item) => {
              if (item.id === habitId) {
                return { ...item, isCompleted: !item.isCompleted }
              }
              // Check children
              if (item.children.some((c) => c.id === habitId)) {
                return {
                  ...item,
                  children: item.children.map((c) =>
                    c.id === habitId ? { ...c, isCompleted: !c.isCompleted } : c,
                  ),
                }
              }
              return item
            })
          },
        )
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      // Rollback optimistic update
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
    },

    onSuccess: (response) => {
      // Streak celebration
      if (response?.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
      }

      // Check all-done celebration
      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters as Record<string, unknown>),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }
    },

    onSettled: () => {
      // Refetch for eventual consistency
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) =>
      skipHabitAction(habitId, date),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      // Optimistic: mark as completed (only when no specific date)
      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => {
            if (!old) return old
            return old.map((item) =>
              item.id === habitId ? { ...item, isCompleted: true } : item,
            )
          },
        )
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateHabitRequest) => createHabitAction(data),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }) =>
      updateHabitAction(habitId, data),

    onSettled: (_data, _err, { habitId }) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) => deleteHabitAction(habitId),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ReorderHabitsRequest) => reorderHabitsAction(data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) => duplicateHabitAction(habitId),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      items,
    }: {
      habitId: string
      items: ChecklistItem[]
    }) => updateChecklistAction(habitId, items),

    onMutate: async ({ habitId, items }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      // Optimistic: update checklist items in cache
      queryClient.setQueriesData<HabitScheduleItem[]>(
        { queryKey: habitKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((item) => {
            if (item.id === habitId) {
              return { ...item, checklistItems: items }
            }
            if (item.children.some((c) => c.id === habitId)) {
              return {
                ...item,
                children: item.children.map((c) =>
                  c.id === habitId ? { ...c, checklistItems: items } : c,
                ),
              }
            }
            return item
          })
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

// ---------------------------------------------------------------------------
// Sub-habit and parent mutations
// ---------------------------------------------------------------------------

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: string
      data: CreateSubHabitRequest
    }) => createSubHabitAction(parentId, data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }) => moveHabitParentAction(habitId, data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkCreateRequest) => bulkCreateHabitsAction(data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitIds: string[]) => bulkDeleteHabitsAction(habitIds),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkLogItemRequest[]) => bulkLogHabitsAction(items),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkSkipItemRequest[]) => bulkSkipHabitsAction(items),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
    },
  })
}

// ---------------------------------------------------------------------------
// Re-export normalize helpers for drill navigation and other consumers
// ---------------------------------------------------------------------------

export { normalizeHabits, sortByPosition }
