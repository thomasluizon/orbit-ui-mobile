'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations, useLocale } from 'next-intl'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import {
  buildRetrospectiveRequestUrl,
  type RetrospectivePeriod,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'

export type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

export function useProgressRetrospective(enabled: boolean) {
  const locale = useLocale()
  return useQuery({
    queryKey: habitKeys.retrospective('month'),
    queryFn: () =>
      fetchJson(
        buildRetrospectiveRequestUrl('month', locale),
        retrospectiveResponseSchema,
      ),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}

export function useRetrospective() {
  const t = useTranslations()
  const locale = useLocale()
  const [data, setData] = useState<RetrospectiveResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noData, setNoData] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [period, setPeriod] = useState<RetrospectivePeriod>('week')
  const requestIdRef = useRef(0)

  const generate = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const isStale = () => requestIdRef.current !== requestId

    setIsLoading(true)
    setError(null)
    setNoData(false)
    setData(null)

    try {
      const res = await fetch(buildRetrospectiveRequestUrl(period, locale))
      if (isStale()) return
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { errorCode?: string; code?: string; error?: string; message?: string }
          | null
        if (isStale()) return
        if ((body?.errorCode ?? body?.code) === NO_HABITS_FOR_PERIOD) {
          setNoData(true)
          return
        }
        throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
      }
      const response = (await res.json()) as RetrospectiveResponse
      if (isStale()) return
      setData(response)
      setFromCache(response.fromCache)
    } catch (err: unknown) {
      if (isStale()) return
      setError(getFriendlyErrorMessage(err, t, 'retrospective.error', 'generic'))
    } finally {
      if (!isStale()) setIsLoading(false)
    }
  }, [period, locale, t])

  return {
    data,
    setData,
    isLoading,
    error,
    setError,
    noData,
    setNoData,
    fromCache,
    period,
    setPeriod,
    generate,
  }
}
