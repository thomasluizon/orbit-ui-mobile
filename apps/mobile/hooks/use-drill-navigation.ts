import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, shouldRetryQuery, queryRetryDelay } from '@orbit/shared/query'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useTranslation } from 'react-i18next'
import { extractBackendStatus, formatAPIDate, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { canRevealCompletedDrillChildren, countCompletedDrillChildren, getVisibleDrillChildren, getDrillParent, mergeDrillSettlementHabits, normalizeHabitDetailForDrill } from '@orbit/shared/utils/drill-navigation'
import type { HabitVisibilityOptions, HabitVisibilityView } from '@orbit/shared/utils/habit-visibility'
import { API } from '@orbit/shared/api'

import type { NormalizedHabit, HabitDetail } from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

async function fetchHabitDetail(habitId: string): Promise<HabitDetail> {
  return apiClient<HabitDetail>(API.habits.get(habitId))
}

export interface DrillNavigationState {
  drillStack: string[]
  currentParentId: string | null
  currentParent: NormalizedHabit | null
  drillChildren: NormalizedHabit[]
  settlementHabitsById: Map<string, NormalizedHabit>
  settlementUpdatedAtById: Map<string, number>
  hasUnfilteredChildren: boolean
  canRevealCompletedChildren: boolean
  completedCount: number
  drillLoading: boolean
  drillError: string
  drillInto: (habitId: string) => Promise<void>
  drillBack: () => void
  drillReset: () => void
  refreshCurrent: () => Promise<void>
  getDrillChildren: (parentId: string) => NormalizedHabit[]
}

export function useDrillNavigation(
  habitsById: Map<string, NormalizedHabit>,
  lastUpdated: number,
  visibilityOptions?: HabitVisibilityOptions,
  view: HabitVisibilityView = 'all',
  todayStr = formatAPIDate(new Date()),
): DrillNavigationState {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [drillStack, setDrillStack] = useState<string[]>([])
  const [drillChildrenMap, setDrillChildrenMap] = useState(
    new Map<string, NormalizedHabit[]>(),
  )
  const [drillHabitsById, setDrillHabitsById] = useState(() => new Map<string, NormalizedHabit>())
  const [settlementUpdatedAtById, setSettlementUpdatedAtById] = useState(() => new Map<string, number>())
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillError, setDrillError] = useState('')

  const [drillView, setDrillView] = useState(view)
  if (drillView !== view) {
    setDrillView(view)
    setDrillStack([])
    setDrillChildrenMap(new Map())
    setDrillHabitsById(new Map())
    setSettlementUpdatedAtById(new Map())
    setDrillLoading(false)
    setDrillError('')
  }

  const currentParentId = drillStack.at(-1) ?? null
  const activeParentIdRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const feedbackPendingRef = useRef(false)
  useEffect(() => {
    activeParentIdRef.current = currentParentId
  }, [currentParentId])

  useEffect(() => () => {
    requestIdRef.current += 1
    feedbackPendingRef.current = false
    const parentId = activeParentIdRef.current
    activeParentIdRef.current = null
    if (parentId) void queryClient.cancelQueries({ queryKey: habitKeys.detail(parentId), exact: true })
  }, [queryClient, view])

  const settlementHabitsById = drillHabitsById

  const currentParent = useMemo(() => {
    return getDrillParent(currentParentId, habitsById, drillHabitsById, drillChildrenMap)
  }, [currentParentId, habitsById, drillHabitsById, drillChildrenMap])

  const drillChildren = useMemo(
    () => currentParentId
      ? visibilityOptions
        ? getVisibleDrillChildren(currentParentId, drillChildrenMap, visibilityOptions, todayStr)
        : drillChildrenMap.get(currentParentId) ?? []
      : [],
    [currentParentId, drillChildrenMap, visibilityOptions, todayStr],
  )
  const hasUnfilteredChildren = currentParentId
    ? (drillChildrenMap.get(currentParentId)?.length ?? 0) > 0
    : false
  const canRevealCompletedChildren = currentParentId !== null && drillChildren.length === 0 && visibilityOptions
    ? canRevealCompletedDrillChildren(currentParentId, drillChildrenMap, visibilityOptions, todayStr)
    : false
  const completedCount = countCompletedDrillChildren(
    drillChildren,
    visibilityOptions?.selectedDate || todayStr,
    visibilityOptions?.recentlyCompletedDates,
  )

  const fetchDrillChildren = useCallback(
    async (habitId: string | null, silent = false, refreshSettlement = false) => {
      if (activeParentIdRef.current !== habitId) return
      const detailIds = refreshSettlement && drillHabitsById.size > 0
        ? [...drillHabitsById.values()].filter(habit => !habit.parentId || !drillHabitsById.has(habit.parentId)).map(habit => habit.id)
        : habitId ? [habitId] : []
      if (detailIds.length === 0) return
      const requestId = ++requestIdRef.current
      const showFeedback = !silent || feedbackPendingRef.current
      feedbackPendingRef.current = showFeedback
      if (showFeedback) {
        setDrillLoading(true)
      }
      try {
        const refreshed = await Promise.all(detailIds.map(async detailId => {
          void queryClient.cancelQueries({ queryKey: habitKeys.detail(detailId), exact: true })
          const detail = await queryClient.fetchQuery({
            queryKey: habitKeys.detail(detailId),
            queryFn: () => fetchHabitDetail(detailId),
            staleTime: 0,
            retry: (failureCount, error) => extractBackendStatus(error) === 429 && shouldRetryQuery(failureCount, error),
            retryDelay: queryRetryDelay,
          })
          return normalizeHabitDetailForDrill(detail, todayStr)
        }))
        if (requestIdRef.current !== requestId || activeParentIdRef.current !== habitId) return
        setDrillHabitsById((previous) => refreshed.reduce(mergeDrillSettlementHabits, previous))
        setSettlementUpdatedAtById((previous) => {
          const next = new Map(previous)
          for (const normalized of refreshed) {
            next.set(normalized.parent.id, lastUpdated)
            for (const children of normalized.childrenByParent.values()) {
              for (const child of children) next.set(child.id, lastUpdated)
            }
          }
          return next
        })

        setDrillChildrenMap((prev) => {
          const next = new Map(prev)
          for (const normalized of refreshed) {
            for (const [parentId, children] of normalized.childrenByParent.entries()) next.set(parentId, children)
          }
          return next
        })
        setDrillError('')
      } catch (err: unknown) {
        if (showFeedback && requestIdRef.current === requestId && activeParentIdRef.current === habitId) {
          setDrillError(getFriendlyErrorMessage(err, t, 'errors.fetchSubHabits', 'subHabit'))
        }
      } finally {
        if (requestIdRef.current === requestId) {
          feedbackPendingRef.current = false
          if (showFeedback) {
            setDrillLoading(false)
          }
        }
      }
    },
    [queryClient, drillHabitsById, lastUpdated, t, todayStr],
  )

  const drillInto = useCallback(
    async (habitId: string) => {
      requestIdRef.current += 1
      feedbackPendingRef.current = false
      setDrillError('')
      setDrillLoading(false)
      activeParentIdRef.current = habitId
      setDrillStack((prev) => [...prev, habitId])
      if (!drillChildrenMap.has(habitId)) {
        await fetchDrillChildren(habitId)
      }
    },
    [drillChildrenMap, fetchDrillChildren],
  )

  const drillBack = useCallback(() => {
    requestIdRef.current += 1
    feedbackPendingRef.current = false
    activeParentIdRef.current = null
    setDrillLoading(false)
    setDrillStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  const drillReset = useCallback(() => {
    requestIdRef.current += 1
    feedbackPendingRef.current = false
    activeParentIdRef.current = null
    setDrillLoading(false)
    setDrillStack([])
    setDrillChildrenMap(new Map())
    setDrillHabitsById(new Map())
    setSettlementUpdatedAtById(new Map())
  }, [])

  const refreshCurrent = useCallback(async () => {
    if (!currentParentId) return
    await fetchDrillChildren(currentParentId, drillError === '')
  }, [currentParentId, drillError, fetchDrillChildren])

  const getDrillChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return visibilityOptions
        ? getVisibleDrillChildren(parentId, drillChildrenMap, visibilityOptions, todayStr)
        : drillChildrenMap.get(parentId) ?? []
    },
    [drillChildrenMap, visibilityOptions, todayStr],
  )

  const lastUpdatedRef = useRef(lastUpdated)
  useEffect(() => {
    if (lastUpdated === lastUpdatedRef.current) return
    lastUpdatedRef.current = lastUpdated
    const parentId = currentParentId
    void Promise.resolve().then(() => fetchDrillChildren(parentId, true, true))
  }, [lastUpdated, currentParentId, fetchDrillChildren])

  useEffect(() => {
    if (!currentParentId) return

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      drillBack()
      return true
    })

    return () => subscription.remove()
  }, [currentParentId, drillBack])

  return {
    drillStack,
    currentParentId,
    currentParent,
    drillChildren,
    settlementHabitsById,
    settlementUpdatedAtById,
    hasUnfilteredChildren,
    canRevealCompletedChildren,
    completedCount,
    drillLoading,
    drillError,
    drillInto,
    drillBack,
    drillReset,
    refreshCurrent,
    getDrillChildren,
  }
}
