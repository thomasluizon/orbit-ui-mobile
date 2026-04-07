import { useMemo, useCallback } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  habitKeys,
  goalKeys,
  gamificationKeys,
  profileKeys,
  QUERY_STALE_TIMES,
} from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildCalendarDayMap,
  formatAPIDate,
} from '@orbit/shared/utils'
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
  LinkedGoalUpdate,
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
  CalendarMonthResponse,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import type { HabitLog } from '@orbit/shared/types/calendar'
import { startOfMonth, endOfMonth } from 'date-fns'
import { apiClient } from '@/lib/api-client'
import { refreshWidget } from '@/lib/orbit-widget'
import { useUIStore } from '@/stores/ui-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyLinkedGoalUpdates(goals: Goal[], updates: LinkedGoalUpdate[]): Goal[] {
  return goals.map((goal) => {
    const update = updates.find(u => u.goalId === goal.id)
    if (!update) return goal
    return {
      ...goal,
      currentValue: update.newProgress,
      progressPercentage: update.targetValue > 0
        ? Math.min(100, Math.round(update.newProgress / update.targetValue * 1000) / 10)
        : 0,
    }
  })
}

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

function triggerWidgetRefresh(): void {
  void refreshWidget().catch(() => {})
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
  const query = useQuery({
    queryKey: habitKeys.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<HabitScheduleItem[]> => {
      const qs = buildQueryString(filters)
      const url = buildUrl(API.habits.list, qs)
      const data = await apiClient<PaginatedResponse<HabitScheduleItem>>(url)

      const allItems = [...data.items]

      // For dateless queries (all view), fetch remaining pages in parallel
      if (!filters.dateFrom && data.totalPages > 1) {
        const pagePromises: Promise<PaginatedResponse<HabitScheduleItem>>[] = []
        for (let p = 2; p <= data.totalPages; p++) {
          const pageFilters = { ...filters, page: p }
          const pageQs = buildQueryString(pageFilters)
          const pageUrl = buildUrl(API.habits.list, pageQs)
          pagePromises.push(apiClient<PaginatedResponse<HabitScheduleItem>>(pageUrl))
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
    queryFn: () => apiClient<HabitDetail>(API.habits.get(id ?? '')),
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
    queryFn: () => apiClient<HabitMetrics>(API.habits.metrics(id ?? '')),
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
    queryFn: () => apiClient<HabitLog[]>(`${API.habits.get(id ?? '')}/logs`),
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
    queryFn: () => apiClient<HabitFullDetail>(API.habits.detail(id ?? '')),
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
    }) =>
      apiClient<LogHabitResponse>(API.habits.log(habitId), {
        method: 'POST',
        body: note || date ? JSON.stringify({ note, date }) : undefined,
      }),

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
      // Streak celebration + update profile streak immediately so StreakBadge reflects it
      if (response?.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, currentStreak: response.currentStreak } : old,
        )
      }

      // Apply targeted goal updates from enriched response (instant, no refetch needed)
      if (response?.linkedGoalUpdates?.length) {
        queryClient.setQueriesData<Goal[]>(
          { queryKey: goalKeys.lists() },
          (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
        )
      }

      // Apply gamification XP/achievement updates from enriched response (instant)
      if (response?.xpEarned || response?.newAchievementIds?.length) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
      }

      // Check all-done celebration
      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters as Record<string, unknown>),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }

      triggerWidgetRefresh()
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
      apiClient<void>(API.habits.skip(habitId), {
        method: 'POST',
        body: date ? JSON.stringify({ date }) : undefined,
      }),

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

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateHabitRequest) =>
      apiClient<{ id: string }>(API.habits.create, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }) =>
      apiClient<void>(API.habits.update(habitId), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    onSettled: (_data, error, { habitId }) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) =>
      apiClient<void>(API.habits.delete(habitId), { method: 'DELETE' }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ReorderHabitsRequest) =>
      apiClient<void>(API.habits.reorder, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) =>
      apiClient<void>(API.habits.duplicate(habitId), { method: 'POST' }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
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
    }) =>
      apiClient<void>(API.habits.checklist(habitId), {
        method: 'PUT',
        body: JSON.stringify({ checklistItems: items }),
      }),

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

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
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
    }) =>
      apiClient<void>(API.habits.subHabits(parentId), {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
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
    }) =>
      apiClient<void>(API.habits.parent(habitId), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkCreateRequest) =>
      apiClient<BulkCreateResponse>(API.habits.bulk, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitIds: string[]) =>
      apiClient<BulkDeleteResponse>(API.habits.bulk, {
        method: 'DELETE',
        body: JSON.stringify({ habitIds }),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkLogItemRequest[]) =>
      apiClient<BulkLogResult>(API.habits.bulkLog, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkSkipItemRequest[]) =>
      apiClient<BulkSkipResult>(API.habits.bulkSkip, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),

    onSettled: (_data, error) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summary('', '') })
      if (!error) {
        triggerWidgetRefresh()
      }
    },
  })
}

export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))

  const query = useQuery({
    queryKey: habitKeys.calendar(monthStart, monthEnd),
    queryFn: () =>
      apiClient<CalendarMonthResponse>(
        `${API.habits.calendarMonth}?dateFrom=${monthStart}&dateTo=${monthEnd}`,
      ),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  const dayMap = useMemo(() => {
    if (!query.data) return new Map()
    return buildCalendarDayMap(query.data)
  }, [query.data])

  return {
    dayMap,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refresh: () => query.refetch(),
  }
}

// ---------------------------------------------------------------------------
// AI Daily Summary
// ---------------------------------------------------------------------------

interface SummaryResponse {
  summary: string
  fromCache: boolean
}

interface UseSummaryOptions {
  date: string
  locale: string
  hasProAccess: boolean
  aiSummaryEnabled: boolean
}

export function useSummary({
  date,
  locale,
  hasProAccess,
  aiSummaryEnabled,
}: UseSummaryOptions) {
  const enabled = hasProAccess && aiSummaryEnabled && !!date

  const query = useQuery({
    queryKey: habitKeys.summary(date, date),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams({
        dateFrom: date,
        dateTo: date,
        includeOverdue: 'true',
        language: locale,
      })

      const data = await apiClient<SummaryResponse>(
        `${API.habits.summary}?${params.toString()}`,
      )
      return data.summary
    },
    enabled,
    staleTime: QUERY_STALE_TIMES.habits,
    refetchOnWindowFocus: false,
  })

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ---------------------------------------------------------------------------
// Total habit count
// ---------------------------------------------------------------------------

export function useTotalHabitCount(): number {
  const query = useQuery({
    queryKey: habitKeys.count(),
    queryFn: async () => {
      const url = buildUrl(API.habits.list, 'pageSize=1')
      const data = await apiClient<PaginatedResponse<HabitScheduleItem>>(url)
      return data.totalCount
    },
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return query.data ?? 0
}

// ---------------------------------------------------------------------------
// Re-export normalize helpers for drill navigation and other consumers
// ---------------------------------------------------------------------------

export { normalizeHabits, sortByPosition }
