import { useEffect, useMemo, useState } from 'react'
import { ScrollView, View, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import {
  getRetrospectiveCacheKey,
  RETROSPECTIVE_PERIODS,
  type RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import {
  useProfile,
  useHasProAccess,
  useIsYearlyPro,
} from '@/hooks/use-profile'
import {
  useRetrospective,
  type RetrospectivePeriod,
} from '@/hooks/use-retrospective'
import { apiClient } from '@/lib/api-client'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useOffline } from '@/hooks/use-offline'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { Chip } from '@/components/ui/chip'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { RetrospectiveLockedYearly } from './retrospective-locked-states'
import { RetrospectiveContent } from './retrospective-view'
import { styles } from './retrospective-styles'

const CACHE_VERSION_SUFFIX = '_v2'

export default function RetrospectiveScreen() {
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
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
  const [portalError, setPortalError] = useState('')
  const [cachedData, setCachedData] = useState<RetrospectiveResponse | null>(
    null,
  )
  const [isCacheLoading, setIsCacheLoading] = useState(true)
  const cacheKey = getRetrospectiveCacheKey(period) + CACHE_VERSION_SUFFIX

  useEffect(() => {
    if (!profile) return
    if (!hasProAccess) {
      router.replace(buildUpgradeHref('/retrospective'))
    }
  }, [hasProAccess, profile, router])

  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey)
  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey)
    setIsCacheLoading(true)
  }

  useEffect(() => {
    let active = true

    void AsyncStorage.getItem(cacheKey)
      .then((value) => {
        if (!active) return
        if (!value) {
          setCachedData(null)
          return
        }
        try {
          setCachedData(JSON.parse(value) as RetrospectiveResponse)
        } catch {
          setCachedData(null)
        }
      })
      .finally(() => {
        if (active) setIsCacheLoading(false)
      })

    return () => {
      active = false
    }
  }, [cacheKey])

  useEffect(() => {
    if (!data) return
    AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {})
  }, [cacheKey, data])

  const displayedData =
    data ?? (!isOnline && !isLoading ? cachedData : null)
  const displayedFromCache =
    fromCache ||
    (!data && !isOnline && !isLoading && cachedData !== null)

  function selectPeriod(next: RetrospectivePeriod) {
    setPeriod(next)
    setData(null)
    setError(null)
    setNoData(false)
  }

  async function handleOpenPortal() {
    if (!isOnline) {
      setPortalError(t('offline.title'))
      return
    }

    setPortalError('')
    try {
      const portal = await apiClient<{ url?: string }>(API.subscription.portal, {
        method: 'POST',
      })
      if (portal?.url) {
        await Linking.openURL(portal.url)
      }
    } catch (err: unknown) {
      setPortalError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    }
  }

  function handleGenerate() {
    if (!isOnline) {
      setError(t('offline.title'))
      return
    }
    void generate()
  }

  const isLoaded = !!profile

  const periodChips = useMemo(
    () =>
      RETROSPECTIVE_PERIODS.map((p) => ({
        id: p,
        label: t(`retrospective.periods.${p}`),
      })),
    [t],
  )

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('retrospective.title')}
        backLabel={t('common.backToProfile')}
      />

      {isLoaded && isYearlyPro ? (
        <>
          {!isOnline ? (
            <View style={styles.offlinePad}>
              <OfflineUnavailableState
                title={t('offline.title')}
                description={t('offline.description')}
                compact
              />
            </View>
          ) : null}
          <View
            style={[styles.tabsRow, { borderBottomColor: tokens.hairline }]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {periodChips.map((p) => (
                <Chip
                  key={p.id}
                  active={period === p.id}
                  onPress={() => selectPeriod(p.id)}
                >
                  {p.label}
                </Chip>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoaded && hasProAccess && !isYearlyPro ? (
          <RetrospectiveLockedYearly
            tokens={tokens}
            isTrialActive={!!profile?.isTrialActive}
            isOnline={isOnline}
            portalError={portalError}
            onSubscribe={() => router.push(buildUpgradeHref('/retrospective'))}
            onOpenPortal={() => {
              void handleOpenPortal()
            }}
          />
        ) : null}

        {isLoaded && isYearlyPro ? (
          <RetrospectiveContent
            tokens={tokens}
            isOnline={isOnline}
            isLoading={isLoading}
            isCacheLoading={isCacheLoading}
            displayedData={displayedData}
            displayedFromCache={displayedFromCache}
            error={error}
            noData={noData}
            onGenerate={handleGenerate}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
