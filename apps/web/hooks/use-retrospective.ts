'use client'

import { useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildRetrospectiveRequestUrl,
  type RetrospectivePeriod,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { getErrorMessage } from '@orbit/shared/utils'

export type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'

export function useRetrospective() {
  const t = useTranslations()
  const locale = useLocale()
  const [retrospective, setRetrospective] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [period, setPeriod] = useState<RetrospectivePeriod>('week')

  const generate = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setRetrospective(null)

    try {
      const res = await fetch(buildRetrospectiveRequestUrl(period, locale))
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
      }
      const data: RetrospectiveResponse = await res.json()
      setRetrospective(data.retrospective)
      setFromCache(data.fromCache)
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('retrospective.error')))
    } finally {
      setIsLoading(false)
    }
  }, [period, locale, t])

  return {
    retrospective,
    setRetrospective,
    isLoading,
    error,
    setError,
    fromCache,
    period,
    setPeriod,
    generate,
  }
}
