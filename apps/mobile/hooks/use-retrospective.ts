import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { getErrorMessage } from '@orbit/shared/utils'
import {
  buildRetrospectiveRequestUrl,
  type RetrospectivePeriod,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { apiClient } from '@/lib/api-client'

export type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'

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
      const data = await apiClient<RetrospectiveResponse>(
        buildRetrospectiveRequestUrl(period, i18n.language ?? 'en'),
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
