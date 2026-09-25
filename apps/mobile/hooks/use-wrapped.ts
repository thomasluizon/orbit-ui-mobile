import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { recapResponseSchema, ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import {
  buildAccountScopedStorageKey,
  buildRecapRequestUrl,
  buildWrappedSlides,
  isRecapShareEmpty,
  readAccountScopedFlag,
  type RecapSharePeriod,
  type ClosedRecapMonth,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useReportEvent } from '@/hooks/use-gamification'
import { useAuthStore } from '@/stores/auth-store'

const WRAPPED_YEAR_SEEN_STORAGE_KEY = 'orbit_wrapped_year_seen'

interface UseWrappedOptions {
  enabled?: boolean
  active?: boolean
  closedMonth?: ClosedRecapMonth
}

/** Fetches and validates the free recap for a Wrapped period and derives the ordered story slides. */
export function useWrapped(period: RecapSharePeriod, options: UseWrappedOptions = {}) {
  const { enabled = true, active = false, closedMonth } = options
  const { mutate: reportEvent } = useReportEvent()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)

  const query = useQuery({
    queryKey: gamificationKeys.recap(period, closedMonth?.year, closedMonth?.month),
    queryFn: async () => recapResponseSchema.parse(await apiClient<unknown>(buildRecapRequestUrl(period, closedMonth))),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })

  const recap = query.data ?? null
  const slides = recap ? buildWrappedSlides(recap) : []
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics, recap.goalCompletions) : false

  useEffect(() => {
    const currentRecap = query.data ?? null
    if (
      !active
      || period !== 'year'
      || !currentRecap
      || isRecapShareEmpty(currentRecap.metrics, currentRecap.goalCompletions)
    ) {
      return
    }
    if (accountId === null) return
    let cancelled = false
    const scopedKey = buildAccountScopedStorageKey(WRAPPED_YEAR_SEEN_STORAGE_KEY, accountId)
    void AsyncStorage.multiGet([scopedKey, WRAPPED_YEAR_SEEN_STORAGE_KEY]).then(([scoped, legacy]) => {
      if (cancelled) return
      const flag = readAccountScopedFlag(scoped?.[1] ?? null, legacy?.[1] ?? null)
      if (flag.seen) {
        if (flag.adoptsLegacy) {
          void AsyncStorage.setItem(scopedKey, '1')
          void AsyncStorage.removeItem(WRAPPED_YEAR_SEEN_STORAGE_KEY)
        }
        return
      }
      void AsyncStorage.setItem(scopedKey, '1')
      reportEvent(ACHIEVEMENT_EVENT_KEYS.wrappedViewed)
    })
    return () => {
      cancelled = true
    }
  }, [accountId, active, period, query.data, reportEvent])

  return {
    recap,
    slides,
    isEmpty,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

interface WrappedStory {
  index: number
  isFirst: boolean
  isLast: boolean
  next: () => void
  prev: () => void
}

/** Tap-driven story controller: clamps the slide index to bounds and exposes next/prev. */
export function useWrappedStory(slideCount: number): WrappedStory {
  const [index, setIndex] = useState(0)

  return {
    index,
    isFirst: index === 0,
    isLast: index >= slideCount - 1,
    next: () => setIndex((current) => Math.min(current + 1, Math.max(slideCount - 1, 0))),
    prev: () => setIndex((current) => Math.max(current - 1, 0)),
  }
}

export type { WrappedSlide } from '@orbit/shared/utils'
