'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { recapResponseSchema, ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import {
  buildRecapRequestUrl,
  buildWrappedSlides,
  isRecapShareEmpty,
  type RecapSharePeriod,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { useReportEvent } from '@/hooks/use-gamification'

const WRAPPED_YEAR_SEEN_STORAGE_KEY = 'orbit_wrapped_year_seen'

interface UseWrappedOptions {
  enabled?: boolean
  active?: boolean
}

/** Fetches and validates the free recap for a Wrapped period and derives the ordered story slides. */
export function useWrapped(period: RecapSharePeriod, options: UseWrappedOptions = {}) {
  const { enabled = true, active = false } = options
  const { mutate: reportEvent } = useReportEvent()

  const query = useQuery({
    queryKey: gamificationKeys.recap(period),
    queryFn: async () => recapResponseSchema.parse(await fetchJson(buildRecapRequestUrl(period))),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })

  const recap = query.data ?? null
  const slides = useMemo(() => (recap ? buildWrappedSlides(recap) : []), [recap])
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics) : false

  useEffect(() => {
    if (!active || period !== 'year' || !recap || isEmpty) return
    const storage = globalThis.localStorage
    if (storage.getItem(WRAPPED_YEAR_SEEN_STORAGE_KEY)) return
    storage.setItem(WRAPPED_YEAR_SEEN_STORAGE_KEY, '1')
    reportEvent(ACHIEVEMENT_EVENT_KEYS.wrappedViewed)
  }, [active, period, recap, isEmpty, reportEvent])

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
