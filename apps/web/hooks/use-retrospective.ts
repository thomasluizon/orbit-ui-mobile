'use client'

import { useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildRetrospectiveRequestUrl,
  type RetrospectivePeriod,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'

export type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

export function useRetrospective() {
  const t = useTranslations()
  const locale = useLocale()
  const [data, setData] = useState<RetrospectiveResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noData, setNoData] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [period, setPeriod] = useState<RetrospectivePeriod>('week')

  const generate = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setNoData(false)
    setData(null)

    try {
      const res = await fetch(buildRetrospectiveRequestUrl(period, locale))
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if ((body?.errorCode ?? body?.code) === NO_HABITS_FOR_PERIOD) {
          setNoData(true)
          return
        }
        throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
      }
      const response: RetrospectiveResponse = await res.json()
      setData(response)
      setFromCache(response.fromCache)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'retrospective.error', 'generic'))
    } finally {
      setIsLoading(false)
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
