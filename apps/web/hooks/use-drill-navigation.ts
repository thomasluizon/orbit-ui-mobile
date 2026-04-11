'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import { normalizeHabitDetailForDrill } from '@orbit/shared/utils/drill-navigation'
import { getErrorMessage, API } from '@orbit/shared/api'
import type { NormalizedHabit, HabitDetail } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Helper: fetch habit detail from the BFF proxy
// ---------------------------------------------------------------------------

async function fetchHabitDetail(habitId: string): Promise<HabitDetail> {
  const res = await fetch(API.habits.get(habitId))
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Failed to fetch habit detail (${res.status})`)
  }
  return res.json() as Promise<HabitDetail>
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  getDrillChildren: (parentId: string) => NormalizedHabit[]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
        const detail = await fetchHabitDetail(habitId)
        const today = formatAPIDate(new Date())
        const normalized = normalizeHabitDetailForDrill(detail, today)
        setDrillParentInfo(normalized.parent)

        setDrillChildrenMap((prev) => {
          const next = new Map(prev)
          for (const [parentId, children] of normalized.childrenByParent.entries()) {
            next.set(parentId, children)
          }
          return next
        })
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

  const getDrillChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return drillChildrenMap.get(parentId) ?? []
    },
    [drillChildrenMap],
  )

  // Auto-refresh drill children when store data updates
  const lastUpdatedRef = useRef(lastUpdated)
  useEffect(() => {
    if (lastUpdated !== lastUpdatedRef.current) {
      lastUpdatedRef.current = lastUpdated
      if (currentParentId) {
        fetchDrillChildren(currentParentId, true)
      }
    }
  }, [lastUpdated, currentParentId, fetchDrillChildren])

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
    getDrillChildren,
  }
}
