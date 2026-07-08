'use client'

import { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  getRetrospectiveCacheKey,
  RETROSPECTIVE_PERIODS,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { useProfile, useHasProAccess, useIsYearlyPro } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { openCustomerPortal } from '@/app/actions/subscription'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { RetrospectiveLockedStates } from './_components/retrospective-locked-states'
import { RetrospectiveView } from './_components/retrospective-view'

const CACHE_VERSION_SUFFIX = '_v2'

const emptySubscribe = () => () => {}

export default function RetrospectivePage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const hasProAccess = useHasProAccess()
  const isYearlyPro = useIsYearlyPro()
  const {
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
  } = useRetrospective()

  const periods: { key: RetrospectivePeriod; label: string }[] = RETROSPECTIVE_PERIODS.map(
    (key) => ({
      key,
      label: t(`retrospective.periods.${key}`),
    }),
  )

  const [portalError, setPortalError] = useState('')
  const cacheKey = getRetrospectiveCacheKey(period) + CACHE_VERSION_SUFFIX

  const cachedRaw = useSyncExternalStore(
    emptySubscribe,
    () => globalThis.localStorage.getItem(cacheKey),
    () => null,
  )
  const cachedData = useMemo(() => {
    if (!cachedRaw) return null
    try {
      return JSON.parse(cachedRaw) as RetrospectiveResponse
    } catch {
      return null
    }
  }, [cachedRaw])

  useEffect(() => {
    if (!profile) return
    if (!hasProAccess) {
      router.replace('/upgrade')
    }
  }, [hasProAccess, profile, router])

  useEffect(() => {
    if (!data) return
    globalThis.localStorage.setItem(cacheKey, JSON.stringify(data))
  }, [cacheKey, data])

  const displayedData = data ?? (!isOnline && !isLoading ? cachedData : null)
  const displayedFromCache =
    fromCache || (!data && !isOnline && !isLoading && cachedData !== null)

  function selectPeriod(key: RetrospectivePeriod) {
    setPeriod(key)
    setData(null)
    setError(null)
    setNoData(false)
  }

  function handleGenerate() {
    if (!isOnline) {
      setError(t('offline.title'))
      return
    }
    void generate()
  }

  const handleOpenPortal = useCallback(async () => {
    if (!isOnline) {
      setPortalError(t('offline.title'))
      return
    }

    setPortalError('')
    try {
      const data = await openCustomerPortal()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    }
  }, [isOnline, t])

  const isLoaded = !!profile

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('retrospective.title')}
      />

      {isLoaded && (
        <RetrospectiveLockedStates
          hasProAccess={hasProAccess}
          isYearlyPro={isYearlyPro}
          isTrialActive={profile?.isTrialActive ?? false}
          portalError={portalError}
          onOpenPortal={() => void handleOpenPortal()}
        />
      )}

      {isLoaded && isYearlyPro && (
        <RetrospectiveView
          periods={periods}
          activePeriod={period}
          data={displayedData}
          isLoading={isLoading}
          errorMessage={error}
          noData={noData}
          fromCache={displayedFromCache}
          isOnline={isOnline}
          onSelectPeriod={selectPeriod}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  )
}
