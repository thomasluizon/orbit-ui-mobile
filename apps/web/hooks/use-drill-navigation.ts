'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { formatAPIDate } from '@orbit/shared/utils'
import { getErrorMessage, API } from '@orbit/shared/api'
import type {
  NormalizedHabit,
  HabitDetail,
  HabitDetailChild,
} from '@orbit/shared/types/habit'

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
// Helper: normalize a HabitDetailChild into a NormalizedHabit
// ---------------------------------------------------------------------------

function normalizeDetailChild(
  child: HabitDetailChild,
  parentId: string,
  today: string,
): NormalizedHabit {
  return {
    id: child.id,
    title: child.title,
    description: child.description,
    frequencyUnit: child.frequencyUnit,
    frequencyQuantity: child.frequencyQuantity,
    isBadHabit: child.isBadHabit,
    isCompleted: child.isCompleted,
    isGeneral: child.isGeneral,
    isFlexible: child.isFlexible,
    days: child.days,
    dueDate: child.dueDate,
    dueTime: child.dueTime ?? '',
    dueEndTime: child.dueEndTime ?? '',
    endDate: child.endDate ?? '',
    position: child.position ?? 0,
    checklistItems: child.checklistItems ?? [],
    createdAtUtc: '',
    parentId,
    scheduledDates: [],
    isOverdue:
      !child.isCompleted &&
      !child.frequencyUnit &&
      !!child.dueDate &&
      child.dueDate < today,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: (child.children?.length ?? 0) > 0,
    flexibleTarget: null,
    flexibleCompleted: 0,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
    searchMatches: null,
  }
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

        const parentNormalized = normalizeDetailChild(
          { ...detail, children: detail.children ?? [] } as HabitDetailChild,
          '',
          today,
        )
        // Override fields the normalizer doesn't fully populate
        parentNormalized.parentId = null
        parentNormalized.createdAtUtc = detail.createdAtUtc
        parentNormalized.position = detail.position
        parentNormalized.reminderEnabled = detail.reminderEnabled
        parentNormalized.reminderTimes = detail.reminderTimes
        parentNormalized.scheduledReminders = detail.scheduledReminders

        setDrillParentInfo(parentNormalized)

        const children: NormalizedHabit[] = detail.children.map((c) =>
          normalizeDetailChild(c, habitId, today),
        )

        setDrillChildrenMap((prev) => {
          const next = new Map(prev)
          next.set(habitId, children)

          // Also store grandchildren info so hasSubHabits works
          for (const c of detail.children) {
            if (c.children.length > 0) {
              const grandchildren: NormalizedHabit[] = c.children.map((gc) =>
                normalizeDetailChild(gc, c.id, today),
              )
              next.set(c.id, grandchildren)
            }
          }

          return next
        })
      } catch (err: unknown) {
        if (!silent) {
          setDrillError(getErrorMessage(err, 'Failed to fetch sub-habits'))
        }
      } finally {
        if (!silent) setDrillLoading(false)
      }
    },
    [],
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
