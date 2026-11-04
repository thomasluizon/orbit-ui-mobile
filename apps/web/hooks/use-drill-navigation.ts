'use client'

import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { habitKeys, shouldRetryQuery, queryRetryDelay, isUpstreamStarting } from '@orbit/shared/query'

import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  countCompletedDrillChildren,
  canRevealCompletedDrillChildren,
  getVisibleDrillChildren,
  getDrillParent,
  getDrillRefreshIds,
  mergeDrillSettlementHabits,
  loadDrillChildren,
  mergeDrillChildrenMap,
} from '@orbit/shared/utils/drill-navigation'
import type { HabitVisibilityOptions, HabitVisibilityView } from '@orbit/shared/utils/habit-visibility'
import { API } from '@orbit/shared/api'
import { extractBackendStatus, formatAPIDate, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { hasOpenOverlay } from '@/lib/overlay-stack'
import type { NormalizedHabit, HabitDetail } from '@orbit/shared/types/habit'

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

function isInsideOpenLayer(target: EventTarget | null): boolean {
  const node = target instanceof HTMLElement ? target : document.activeElement
  if (!(node instanceof HTMLElement)) return false
  return node.closest('[role="dialog"], [role="menu"]') !== null
}

async function fetchHabitDetail(habitId: string): Promise<HabitDetail> {
  if (!onlineManager.isOnline()) throw new TypeError('Network request failed')
  return fetchJson<HabitDetail>(API.habits.get(habitId))
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

/**
 * @param habitsById - The normalized habits map from the main query
 * @param lastUpdated - Counter that increments when the habits query refetches
 */
export function useDrillNavigation(
  habitsById: Map<string, NormalizedHabit>,
  lastUpdated: number,
  visibilityOptions?: HabitVisibilityOptions,
  view: HabitVisibilityView = 'all',
  todayStr = formatAPIDate(new Date()),
): DrillNavigationState {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const [drillStack, setDrillStack] = useAccountScopedState<string[]>(() => [])
  const [drillChildrenMap, setDrillChildrenMap] = useAccountScopedState(
    () => new Map<string, NormalizedHabit[]>(),
  )
  const [drillHabitsById, setDrillHabitsById] = useAccountScopedState(() => new Map<string, NormalizedHabit>())
  const [settlementUpdatedAtById, setSettlementUpdatedAtById] = useAccountScopedState(() => new Map<string, number>())
  const [drillLoading, setDrillLoading] = useAccountScopedState(false)
  const [drillError, setDrillError] = useAccountScopedState('')

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
  const settlementRequestIdRef = useRef(0)
  const feedbackPendingRef = useRef(false)
  useEffect(() => {
    activeParentIdRef.current = currentParentId
  }, [currentParentId])

  useEffect(() => () => {
    requestIdRef.current += 1
    settlementRequestIdRef.current += 1
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
      if (!refreshSettlement && activeParentIdRef.current !== habitId) return
      const detailIds = getDrillRefreshIds(habitId, drillHabitsById, refreshSettlement)
      if (detailIds.length === 0) return
      const requestId = ++requestIdRef.current
      const settlementRequestId = ++settlementRequestIdRef.current
      const isActiveNavigation = () => requestIdRef.current === requestId && activeParentIdRef.current === habitId
      const canCommitSettlement = () => settlementRequestIdRef.current === settlementRequestId && (refreshSettlement || isActiveNavigation())
      const showFeedback = !silent || feedbackPendingRef.current
      feedbackPendingRef.current = showFeedback
      if (showFeedback) setDrillLoading(true)
      try {
        const refreshed = await Promise.all(detailIds.map(detailId => {
          void queryClient.cancelQueries({ queryKey: habitKeys.detail(detailId), exact: true })
          return loadDrillChildren(detailId, (parentId) => queryClient.fetchQuery({
            queryKey: habitKeys.detail(parentId),
            queryFn: () => fetchHabitDetail(parentId),
            staleTime: 0,
            networkMode: 'always',
            retry: (failureCount, error) => navigator.onLine && (extractBackendStatus(error) === 429 || isUpstreamStarting(error)) && shouldRetryQuery(failureCount, error),
            retryDelay: queryRetryDelay,
          }), todayStr)
        }))
        if (!canCommitSettlement()) return
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
        setDrillChildrenMap((prev) =>
          refreshed.reduce((current, normalized) => mergeDrillChildrenMap(current, normalized.childrenByParent), prev),
        )
        if (isActiveNavigation()) setDrillError('')
      } catch (err: unknown) {
        if (!canCommitSettlement()) return
        // WHY: Failed and offline refreshes must release settlement against cached children. https://github.com/thomasluizon/orbit-tickets/issues/1984
        setSettlementUpdatedAtById(previous => {
          const next = new Map(previous)
          for (const id of drillHabitsById.keys()) next.set(id, lastUpdated)
          return next
        })
        if (showFeedback && isActiveNavigation()) {
          setDrillError(getFriendlyErrorMessage(err, t, 'errors.fetchSubHabits', 'subHabit'))
        }
      } finally {
        if (requestIdRef.current === requestId) {
          feedbackPendingRef.current = false
          setDrillLoading(false)
        }
      }
    },
    [queryClient, drillHabitsById, lastUpdated, setDrillChildrenMap, setDrillError, setDrillLoading, setDrillHabitsById, setSettlementUpdatedAtById, t, todayStr],
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
        await fetchDrillChildren(habitId, false, drillHabitsById.size > 0)
      }
    },
    [drillChildrenMap, drillHabitsById, fetchDrillChildren, setDrillError, setDrillLoading, setDrillStack],
  )

  const drillBack = useCallback(() => {
    requestIdRef.current += 1
    feedbackPendingRef.current = false
    activeParentIdRef.current = null
    setDrillLoading(false)
    setDrillStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [setDrillLoading, setDrillStack])

  const drillReset = useCallback(() => {
    requestIdRef.current += 1
    settlementRequestIdRef.current += 1
    feedbackPendingRef.current = false
    activeParentIdRef.current = null
    setDrillLoading(false)
    setDrillStack([])
    setDrillChildrenMap(new Map())
    setDrillHabitsById(new Map())
    setSettlementUpdatedAtById(new Map())
  }, [setDrillChildrenMap, setDrillLoading, setDrillHabitsById, setSettlementUpdatedAtById, setDrillStack])

  const refreshCurrent = useCallback(async () => {
    if (!currentParentId) return
    await fetchDrillChildren(currentParentId, drillError === '', true)
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
    const settlementRequestId = settlementRequestIdRef.current
    void Promise.resolve().then(() => {
      if (settlementRequestIdRef.current === settlementRequestId) return fetchDrillChildren(currentParentId, true, true)
    })
  }, [lastUpdated, currentParentId, fetchDrillChildren])

  useEffect(() => {
    if (!currentParentId) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (hasOpenOverlay()) return
      if (isTextEntryTarget(event.target)) return
      if (isInsideOpenLayer(event.target)) return
      event.preventDefault()
      drillBack()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
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
