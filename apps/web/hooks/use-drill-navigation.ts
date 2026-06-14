'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  loadDrillChildren,
  mergeDrillChildrenMap,
} from '@orbit/shared/utils/drill-navigation'
import { getErrorMessage, API } from '@orbit/shared/api'
import { fetchJson } from '@/lib/api-fetch'
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
): DrillNavigationState {
  const t = useTranslations()
  const [drillStack, setDrillStack] = useState<string[]>([])
  const [drillChildrenMap, setDrillChildrenMap] = useState(
    new Map<string, NormalizedHabit[]>(),
  )
  const [drillParentInfo, setDrillParentInfo] = useState<NormalizedHabit | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillError, setDrillError] = useState('')

  const currentParentId = drillStack.at(-1) ?? null

  const currentParent = useMemo(() => {
    if (!currentParentId) return null
    return habitsById.get(currentParentId) ?? drillParentInfo
  }, [currentParentId, habitsById, drillParentInfo])

  const drillChildren = useMemo(
    () => (currentParentId ? drillChildrenMap.get(currentParentId) ?? [] : []),
    [currentParentId, drillChildrenMap],
  )

  const fetchDrillChildren = useCallback(
    async (habitId: string, silent = false) => {
      if (!silent) setDrillLoading(true)
      try {
        const normalized = await loadDrillChildren(habitId, fetchHabitDetail)
        setDrillParentInfo(normalized.parent)
        setDrillChildrenMap((prev) =>
          mergeDrillChildrenMap(prev, normalized.childrenByParent),
        )
      } catch (err: unknown) {
        if (!silent) {
          setDrillError(getErrorMessage(err, t('errors.fetchSubHabits')))
        }
      } finally {
        if (!silent) setDrillLoading(false)
      }
    },
    [t],
  )

  const drillInto = useCallback(
    async (habitId: string) => {
      setDrillError('')
      setDrillStack((prev) => [...prev, habitId])
      if (!drillChildrenMap.has(habitId)) {
        await fetchDrillChildren(habitId)
      }
    },
    [drillChildrenMap, fetchDrillChildren],
  )

  const drillBack = useCallback(() => {
    setDrillStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  const drillReset = useCallback(() => {
    setDrillStack([])
    setDrillChildrenMap(new Map())
    setDrillParentInfo(null)
  }, [])

  const refreshCurrent = useCallback(async () => {
    if (!currentParentId) return
    await fetchDrillChildren(currentParentId, true)
  }, [currentParentId, fetchDrillChildren])

  const getDrillChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return drillChildrenMap.get(parentId) ?? []
    },
    [drillChildrenMap],
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
    drillLoading,
    drillError,
    drillInto,
    drillBack,
    drillReset,
    refreshCurrent,
    getDrillChildren,
  }
}
