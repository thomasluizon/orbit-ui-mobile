import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

export type RetrospectivePeriod = 'week' | 'month' | 'quarter' | 'semester' | 'year'

interface RetrospectiveResponse {
  retrospective: string
  fromCache: boolean
}

export function useRetrospective() {
  const { t } = useTranslation()
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
        language: i18n.language ?? 'en',
      })
      const data = await apiClient<RetrospectiveResponse>(
        `${API.habits.retrospective}?${params.toString()}`,
      )
      setRetrospective(data.retrospective)
      setFromCache(data.fromCache)
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('retrospective.error')))
    } finally {
      setIsLoading(false)
    }
  }, [period, t])

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
