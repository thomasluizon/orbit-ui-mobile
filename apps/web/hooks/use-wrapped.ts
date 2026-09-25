'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { fetchJson } from '@/lib/api-fetch'
import { useReportEvent } from '@/hooks/use-gamification'
import { useHeldAccountId } from '@/stores/auth-store'

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
  const accountId = useHeldAccountId()

  const query = useQuery({
    queryKey: gamificationKeys.recap(period, closedMonth?.year, closedMonth?.month),
    queryFn: async () => recapResponseSchema.parse(await fetchJson(buildRecapRequestUrl(period, closedMonth))),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })

  const recap = query.data ?? null
  // react-doctor-disable-next-line exhaustive-deps -- recap aliases query.data and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const slides = useMemo(() => (recap ? buildWrappedSlides(recap) : []), [recap])
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics, recap.goalCompletions) : false

  useEffect(() => {
    if (!active || period !== 'year' || !recap || isEmpty) return
    if (accountId === null) return
    const storage = globalThis.localStorage
    const scopedKey = buildAccountScopedStorageKey(WRAPPED_YEAR_SEEN_STORAGE_KEY, accountId)
    const flag = readAccountScopedFlag(
      storage.getItem(scopedKey),
      storage.getItem(WRAPPED_YEAR_SEEN_STORAGE_KEY),
    )
    if (flag.seen) {
      if (flag.adoptsLegacy) {
        storage.setItem(scopedKey, '1')
        storage.removeItem(WRAPPED_YEAR_SEEN_STORAGE_KEY)
      }
      return
    }
    storage.setItem(scopedKey, '1')
    reportEvent(ACHIEVEMENT_EVENT_KEYS.wrappedViewed)
    // react-doctor-disable-next-line exhaustive-deps -- recap aliases query.data and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [accountId, active, period, recap, isEmpty, reportEvent])

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

  const next = useCallback(
    () => setIndex((current) => Math.min(current + 1, Math.max(slideCount - 1, 0))),
    [slideCount],
  )
  const prev = useCallback(() => setIndex((current) => Math.max(current - 1, 0)), [])

  return {
    index,
    isFirst: index === 0,
    isLast: index >= slideCount - 1,
    next,
    prev,
  }
}

export type { WrappedSlide } from '@orbit/shared/utils'
