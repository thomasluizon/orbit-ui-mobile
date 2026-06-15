'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RETROSPECTIVE_PERIODS } from '@orbit/shared/utils/retrospective'
import { useProfile, useHasProAccess, useIsYearlyPro } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { openCustomerPortal } from '@/app/actions/subscription'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { RetrospectiveLockedStates } from './_components/retrospective-locked-states'
import { RetrospectiveView } from './_components/retrospective-view'

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

  useEffect(() => {
    if (!profile) return
    if (!hasProAccess || !isYearlyPro) {
      router.replace('/upgrade')
    }
  }, [hasProAccess, isYearlyPro, profile, router])

  function selectPeriod(key: RetrospectivePeriod) {
    setPeriod(key)
    setData(null)
    setError(null)
    setNoData(false)
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
          onOpenPortal={handleOpenPortal}
        />
      )}

      {isLoaded && isYearlyPro && (
        <RetrospectiveView
          periods={periods}
          activePeriod={period}
          data={data}
          isLoading={isLoading}
          hasError={!!error}
          noData={noData}
          fromCache={fromCache}
          isOnline={isOnline}
          onSelectPeriod={selectPeriod}
          onGenerate={generate}
        />
      )}
    </div>
  )
}
