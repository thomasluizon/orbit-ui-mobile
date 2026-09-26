'use client'

import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  countCompletedDrillChildren,
  canRevealCompletedDrillChildren,
  getVisibleDrillChildren,
  loadDrillChildren,
  mergeDrillChildrenMap,
} from '@orbit/shared/utils/drill-navigation'
import type { HabitVisibilityOptions, HabitVisibilityView } from '@orbit/shared/utils/habit-visibility'
import { API } from '@orbit/shared/api'
import { formatAPIDate, getFriendlyErrorMessage } from '@orbit/shared/utils'
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
  return fetchJson<HabitDetail>(API.habits.get(habitId))
}

export interface DrillNavigationState {
  drillStack: string[]
  currentParentId: string | null
  currentParent: NormalizedHabit | null
  drillChildren: NormalizedHabit[]
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
 * Manages sub-habit drill-down navigation.
 * Keeps a stack of parent IDs and fetches children on demand.
 *
 * @param habitsById - The normalized habits map from the main query
 * @param lastUpdated - Counter that increments when the habits query refetches
 *   (used to auto-refresh drill children for eventual consistency)
 */
export function useDrillNavigation(
  habitsById: Map<string, NormalizedHabit>,
  lastUpdated: number,
  visibilityOptions?: HabitVisibilityOptions,
  view: HabitVisibilityView = 'all',
  todayStr = formatAPIDate(new Date()),
): DrillNavigationState {
  const t = useTranslations()
  const [drillStack, setDrillStack] = useAccountScopedState<string[]>(() => [])
  const [drillChildrenMap, setDrillChildrenMap] = useAccountScopedState(
    () => new Map<string, NormalizedHabit[]>(),
  )
  const [drillParentInfo, setDrillParentInfo] = useAccountScopedState<NormalizedHabit | null>(null)
  const [drillLoading, setDrillLoading] = useAccountScopedState(false)
  const [drillError, setDrillError] = useAccountScopedState('')

  const currentParentId = drillStack.at(-1) ?? null
  const activeParentIdRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const feedbackPendingRef = useRef(false)
  useEffect(() => {
    activeParentIdRef.current = currentParentId
  }, [currentParentId])

  const currentParent = useMemo(() => {
    if (!currentParentId) return null
    return habitsById.get(currentParentId) ?? drillParentInfo
  }, [currentParentId, habitsById, drillParentInfo])

  const drillChildren = useMemo(
    () => currentParentId
      ? visibilityOptions
        ? getVisibleDrillChildren(currentParentId, drillChildrenMap, visibilityOptions, view, todayStr)
        : drillChildrenMap.get(currentParentId) ?? []
      : [],
    [currentParentId, drillChildrenMap, visibilityOptions, view, todayStr],
  )
  const hasUnfilteredChildren = currentParentId
    ? (drillChildrenMap.get(currentParentId)?.length ?? 0) > 0
    : false
  const canRevealCompletedChildren = currentParentId !== null && drillChildren.length === 0 && visibilityOptions
    ? canRevealCompletedDrillChildren(currentParentId, drillChildrenMap, visibilityOptions, view, todayStr)
    : false
  const completedCount = countCompletedDrillChildren(
    drillChildren,
    visibilityOptions?.selectedDate || todayStr,
    visibilityOptions?.recentlyCompletedDates,
  )

  const fetchDrillChildren = useCallback(
    async (habitId: string, silent = false) => {
      if (activeParentIdRef.current !== habitId) return
      const requestId = ++requestIdRef.current
      const showFeedback = !silent || feedbackPendingRef.current
      feedbackPendingRef.current = showFeedback
      if (showFeedback) setDrillLoading(true)
      try {
        const normalized = await loadDrillChildren(habitId, fetchHabitDetail, todayStr)
        if (requestIdRef.current !== requestId || activeParentIdRef.current !== habitId) return
        setDrillParentInfo(normalized.parent)
        setDrillChildrenMap((prev) =>
          mergeDrillChildrenMap(prev, normalized.childrenByParent),
        )
        setDrillError('')
      } catch (err: unknown) {
        if (showFeedback && requestIdRef.current === requestId && activeParentIdRef.current === habitId) {
          setDrillError(getFriendlyErrorMessage(err, t, 'errors.fetchSubHabits', 'subHabit'))
        }
      } finally {
        if (requestIdRef.current === requestId) {
          feedbackPendingRef.current = false
          if (showFeedback) setDrillLoading(false)
        }
      }
    },
    [setDrillChildrenMap, setDrillError, setDrillLoading, setDrillParentInfo, t, todayStr],
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
    [drillChildrenMap, fetchDrillChildren, setDrillError, setDrillLoading, setDrillStack],
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
    feedbackPendingRef.current = false
    activeParentIdRef.current = null
    setDrillLoading(false)
    setDrillStack([])
    setDrillChildrenMap(new Map())
    setDrillParentInfo(null)
  }, [setDrillChildrenMap, setDrillLoading, setDrillParentInfo, setDrillStack])

  const refreshCurrent = useCallback(async () => {
    if (!currentParentId) return
    await fetchDrillChildren(currentParentId, drillError === '')
  }, [currentParentId, drillError, fetchDrillChildren])

  const getDrillChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return visibilityOptions
        ? getVisibleDrillChildren(parentId, drillChildrenMap, visibilityOptions, view, todayStr)
        : drillChildrenMap.get(parentId) ?? []
    },
    [drillChildrenMap, visibilityOptions, view, todayStr],
  )

  const lastUpdatedRef = useRef(lastUpdated)
  useEffect(() => {
    if (lastUpdated === lastUpdatedRef.current) return
    lastUpdatedRef.current = lastUpdated
    if (!currentParentId) return
    void Promise.resolve().then(() => fetchDrillChildren(currentParentId, true))
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
