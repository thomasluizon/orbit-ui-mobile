import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/lib/i18n'
import {
  extractBackendErrorCode,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import {
  buildRetrospectiveRequestUrl,
  type RetrospectivePeriod,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { apiClient } from '@/lib/api-client'

export type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'

const NO_HABITS_FOR_PERIOD = 'NO_HABITS_FOR_PERIOD'

export function useRetrospective() {
  const { t } = useTranslation()
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
      const response = await apiClient<RetrospectiveResponse>(
        buildRetrospectiveRequestUrl(period, i18n.language ?? 'en'),
      )
      setData(response)
      setFromCache(response.fromCache)
    } catch (err: unknown) {
      if (extractBackendErrorCode(err) === NO_HABITS_FOR_PERIOD) {
        setNoData(true)
      } else {
        setError(getFriendlyErrorMessage(err, t, 'retrospective.error', 'generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [period, t])

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
