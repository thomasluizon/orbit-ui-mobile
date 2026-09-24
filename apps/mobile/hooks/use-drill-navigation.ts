import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatAPIDate, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { getVisibleDrillChildren, normalizeHabitDetailForDrill } from '@orbit/shared/utils/drill-navigation'
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
): DrillNavigationState {
  const { t } = useTranslation()
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
    () => currentParentId
      ? visibilityOptions
        ? getVisibleDrillChildren(currentParentId, drillChildrenMap, visibilityOptions, view, formatAPIDate(new Date()))
        : drillChildrenMap.get(currentParentId) ?? []
      : [],
    [currentParentId, drillChildrenMap, visibilityOptions, view],
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
          setDrillError(getFriendlyErrorMessage(err, t, 'errors.fetchSubHabits', 'subHabit'))
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
      return visibilityOptions
        ? getVisibleDrillChildren(parentId, drillChildrenMap, visibilityOptions, view, formatAPIDate(new Date()))
        : drillChildrenMap.get(parentId) ?? []
    },
    [drillChildrenMap, visibilityOptions, view],
  )

  const lastUpdatedRef = useRef(lastUpdated)
  useEffect(() => {
    if (lastUpdated === lastUpdatedRef.current) return
    lastUpdatedRef.current = lastUpdated
    if (!currentParentId) return
    const parentId = currentParentId
    void Promise.resolve().then(() => fetchDrillChildren(parentId, true))
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
    drillLoading,
    drillError,
    drillInto,
    drillBack,
    drillReset,
    refreshCurrent,
    getDrillChildren,
  }
}
