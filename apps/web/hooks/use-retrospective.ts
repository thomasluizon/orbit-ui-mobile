'use client'

import { useState, useCallback } from 'react'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'

export type RetrospectivePeriod = 'week' | 'month' | 'quarter' | 'semester' | 'year'

interface RetrospectiveResponse {
  retrospective: string
  fromCache: boolean
}

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string) => {
  const strings: Record<string, string> = {
    'retrospective.error': 'Failed to generate retrospective. Please try again.',
  }
  return strings[key] ?? key
}

export function useRetrospective() {
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
      const params = new URLSearchParams({
        period,
        language: 'en',
      })
      const res = await fetch(`${API.habits.retrospective}?${params.toString()}`)
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
  }, [period])

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
