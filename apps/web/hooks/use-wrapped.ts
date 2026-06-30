'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import {
  buildRecapRequestUrl,
  buildWrappedSlides,
  isRecapShareEmpty,
  type RecapSharePeriod,
  type WrappedSlide,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'

const WRAPPED_YEAR_SEEN_STORAGE_KEY = 'orbit_wrapped_year_seen'

interface UseWrappedOptions {
  enabled?: boolean
  active?: boolean
}

/** Fetches and validates the free recap for a Wrapped period and derives the ordered story slides. */
export function useWrapped(period: RecapSharePeriod, options: UseWrappedOptions = {}) {
  const { enabled = true, active = false } = options
  const queryClient = useQueryClient()

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
    if (!storage || storage.getItem(WRAPPED_YEAR_SEEN_STORAGE_KEY)) return
    storage.setItem(WRAPPED_YEAR_SEEN_STORAGE_KEY, '1')
    // Year in Review is awarded server-side by #196; invalidating here only surfaces it once live: https://github.com/thomasluizon/orbit-ui-mobile/issues/196
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
  }, [active, period, recap, isEmpty, queryClient])

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

export type { WrappedSlide }
