import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lock, Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
import {
  getRetrospectiveCacheKey,
  RETROSPECTIVE_PERIODS,
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
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { SectionHeadTabs } from '@/components/ui/section-head-tabs'
import { SectionLabel } from '@/components/ui/section-label'
import { PullQuote } from '@/components/chat/pull-quote'

type Tokens = ReturnType<typeof createTokensV2>

// ---------------------------------------------------------------------------
// Retrospective Screen — v8 Linear-tactical chrome
// Tabs (Week/Month/Quarter/Semester/Year) + Astra-attributed content/generate/loading.
// ---------------------------------------------------------------------------

interface RetrospectiveBodyProps {
  text: string
  tokens: Tokens
}

function RetrospectiveBody({
  text,
  tokens,
}: Readonly<RetrospectiveBodyProps>) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  function renderInlineMarkdown(line: string) {
    const parts = line.split(/(\*\*.+?\*\*)/g).filter(Boolean)

    return parts.map((part, index) => {
      const strongMatch = /^\*\*(.+?)\*\*$/.exec(part)
      if (strongMatch) {
        return (
          <Text
            key={`${part}-${index}`}
            style={[styles.bodyStrong, { color: tokens.fg1 }]}
          >
            {strongMatch[1]}
          </Text>
        )
      }

      return (
        <Text
          key={`${part}-${index}`}
          style={[styles.bodyInline, { color: tokens.fg2 }]}
        >
          {part}
        </Text>
      )
    })
  }

  return (
    <View style={styles.bodyStack}>
      {lines.map((line, index) => {
        const headingMatch = /^\*\*(.+?)\*\*$/.exec(line)
        if (headingMatch) {
          return (
            <View key={`${line}-${index}`} style={styles.bodyHeadingWrap}>
              <SectionLabel top={14} bottom={6}>
                {headingMatch[1]}
              </SectionLabel>
            </View>
          )
        }

        return (
          <Text
            key={`${line}-${index}`}
            style={[styles.bodyParagraph, { color: tokens.fg2 }]}
          >
            {renderInlineMarkdown(line)}
          </Text>
        )
      })}
    </View>
  )
}

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
    retrospective,
    setRetrospective,
    isLoading,
    error,
    setError,
    fromCache,
    period,
    setPeriod,
    generate,
  } = useRetrospective()
  const [portalError, setPortalError] = useState('')
  const [cachedRetrospective, setCachedRetrospective] = useState<string | null>(
    null,
  )
  const [isCacheLoading, setIsCacheLoading] = useState(true)
  const cacheKey = getRetrospectiveCacheKey(period)

  useEffect(() => {
    if (!profile) return
    if (!hasProAccess || !isYearlyPro) {
      router.replace('/upgrade')
    }
  }, [hasProAccess, isYearlyPro, profile, router])

  useEffect(() => {
    let active = true
     
    setIsCacheLoading(true)

    AsyncStorage.getItem(cacheKey)
      .then((value) => {
        if (active) setCachedRetrospective(value)
      })
      .finally(() => {
        if (active) setIsCacheLoading(false)
      })

    return () => {
      active = false
    }
  }, [cacheKey])

  useEffect(() => {
    if (!retrospective) return
    AsyncStorage.setItem(cacheKey, retrospective).catch(() => {})
  }, [cacheKey, retrospective])

  const displayedRetrospective =
    retrospective ?? (!isOnline && !isLoading ? cachedRetrospective : null)
  const displayedFromCache =
    fromCache ||
    (!retrospective && !isOnline && !isLoading && cachedRetrospective !== null)

  function selectPeriod(next: RetrospectivePeriod) {
    setPeriod(next)
    setRetrospective(null)
    setError(null)
  }

  async function handleOpenPortal() {
    if (!isOnline) {
      setPortalError(t('calendarSync.notConnected'))
      return
    }

    setPortalError('')
    try {
      const data = await apiClient<{ url?: string }>(API.subscription.portal, {
        method: 'POST',
      })
      if (data?.url) {
        await Linking.openURL(data.url)
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }

  function handleGenerate() {
    if (!isOnline) {
      setError(t('calendarSync.notConnected'))
      return
    }
    void generate()
  }

  const isLoaded = !!profile

  const periodTabs = useMemo(
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
        backLabel={t('common.goBack')}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoaded && !hasProAccess ? (
          <View style={styles.lockedBlock}>
            <View
              style={[
                styles.lockedIconCircle,
                { backgroundColor: tokens.bgSunk },
              ]}
            >
              <Lock size={28} color={tokens.fg3} strokeWidth={1.4} />
            </View>
            <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
              {t('retrospective.locked')}
            </Text>
            <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
              {t('retrospective.lockedHint')}
            </Text>
            <Pressable
              onPress={() => router.push(buildUpgradeHref('/retrospective'))}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed
                    ? tokens.primaryPressed
                    : tokens.primary,
                },
              ]}
            >
              <Text
                style={[styles.primaryBtnText, { color: tokens.fgOnPrimary }]}
              >
                {t('upgrade.subscribe')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isLoaded && hasProAccess && !isYearlyPro ? (
          <View style={styles.lockedBlock}>
            <View
              style={[
                styles.lockedIconCircle,
                { backgroundColor: tokens.bgSunk },
              ]}
            >
              <Lock size={28} color={tokens.fg3} strokeWidth={1.4} />
            </View>
            <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
              {t('retrospective.lockedYearly')}
            </Text>
            <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
              {t('retrospective.lockedYearlyHint')}
            </Text>
            {profile?.isTrialActive ? (
              <Pressable
                onPress={() => router.push(buildUpgradeHref('/retrospective'))}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: pressed
                      ? tokens.primaryPressed
                      : tokens.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: tokens.fgOnPrimary },
                  ]}
                >
                  {t('upgrade.subscribe')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleOpenPortal}
                disabled={!isOnline}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: pressed
                      ? tokens.primaryPressed
                      : tokens.primary,
                  },
                  !isOnline && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: tokens.fgOnPrimary },
                  ]}
                >
                  {t('retrospective.changePlan')}
                </Text>
              </Pressable>
            )}
            {!isOnline ? (
              <OfflineUnavailableState
                title={t('calendarSync.notConnected')}
                description={`${t('retrospective.generate')} / ${t('retrospective.changePlan')}`}
                compact
              />
            ) : null}
            {portalError ? (
              <Text style={[styles.statusError, { color: tokens.statusBad }]}>
                {portalError}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isLoaded && isYearlyPro ? (
          <>
            {!isOnline ? (
              <View style={styles.offlinePad}>
                <OfflineUnavailableState
                  title={t('calendarSync.notConnected')}
                  description={`${t('retrospective.generate')} / ${t('retrospective.changePlan')}`}
                  compact
                />
              </View>
            ) : null}

            <View
              style={[
                styles.tabsRow,
                { borderBottomColor: tokens.hairline },
              ]}
            >
              <SectionHeadTabs
                tabs={periodTabs}
                active={period}
                onChange={selectPeriod}
              />
            </View>

            {isLoading ? (
              <View style={styles.skeletonStack}>
                <Text
                  style={[styles.skeletonLabel, { color: tokens.fg3 }]}
                >
                  {t('retrospective.generating')}
                </Text>
                <View
                  style={[
                    styles.skeletonLine,
                    { width: '60%', backgroundColor: tokens.bgSunk },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonLine,
                    { width: '80%', backgroundColor: tokens.bgSunk },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonLine,
                    { width: '40%', backgroundColor: tokens.bgSunk },
                  ]}
                />
              </View>
            ) : null}

            {!isLoading && displayedRetrospective ? (
              <View style={styles.contentWrap}>
                {/* Astra eyebrow + regenerate */}
                <View style={styles.astraRow}>
                  <View style={styles.astraEyebrowGroup}>
                    <Sparkles size={11} color={tokens.primary} strokeWidth={1.7} />
                    <Text
                      style={[styles.astraEyebrow, { color: tokens.fg3 }]}
                    >
                      {t('retrospective.astraEyebrow')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleGenerate}
                    accessibilityRole="button"
                    style={styles.regenLinkPress}
                  >
                    <Text
                      style={[styles.regenLink, { color: tokens.fg3 }]}
                    >
                      {t('retrospective.regenerate')}
                    </Text>
                  </Pressable>
                </View>
                <RetrospectiveBody
                  text={displayedRetrospective}
                  tokens={tokens}
                />
                {displayedFromCache ? (
                  <View style={styles.cachedRow}>
                    <Text
                      style={[styles.cachedText, { color: tokens.fg4 }]}
                    >
                      {t('retrospective.cached')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!isLoading && error && (!displayedRetrospective || isOnline) ? (
              <View style={styles.errorWrap}>
                <Text style={[styles.errorText, { color: tokens.statusBad }]}>
                  {t('retrospective.error')}
                </Text>
                <Pressable
                  onPress={handleGenerate}
                  accessibilityRole="button"
                  style={styles.retryLinkPress}
                >
                  <Text style={[styles.retryLink, { color: tokens.fg1 }]}>
                    {t('common.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {!isLoading &&
            !displayedRetrospective &&
            !error &&
            !isCacheLoading ? (
              <View style={styles.generateBlock}>
                <PullQuote eyebrow={t('retrospective.astraEyebrow')}>
                  {t('retrospective.empty')}
                </PullQuote>
                <View style={styles.generateBtnWrap}>
                  <Pressable
                    onPress={handleGenerate}
                    accessibilityRole="button"
                    disabled={!isOnline}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        backgroundColor: pressed
                          ? tokens.primaryPressed
                          : tokens.primary,
                      },
                      !isOnline && { opacity: 0.5 },
                    ]}
                  >
                    <Sparkles
                      size={14}
                      color={tokens.fgOnPrimary}
                      strokeWidth={1.7}
                    />
                    <Text
                      style={[
                        styles.primaryBtnText,
                        { color: tokens.fgOnPrimary },
                      ]}
                    >
                      {t('retrospective.generate')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  lockedBlock: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 14,
  },
  lockedIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    fontFamily: 'Geist',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.17,
    textAlign: 'center',
  },
  lockedDescription: {
    fontFamily: 'Geist',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  tabsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  offlinePad: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  skeletonStack: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    gap: 14,
    alignItems: 'center',
  },
  skeletonLabel: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontStyle: 'italic',
  },
  skeletonLine: {
    height: 7,
    borderRadius: 4,
    alignSelf: 'stretch',
  },
  contentWrap: {
    position: 'relative',
    paddingTop: 8,
  },
  astraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  astraEyebrowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  astraEyebrow: {
    fontFamily: 'GeistMono',
    fontSize: 10.5,
    letterSpacing: 0.63,
    textTransform: 'uppercase',
  },
  regenLinkPress: { padding: 4 },
  regenLink: {
    fontFamily: 'Geist',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  bodyStack: { gap: 4, paddingHorizontal: 22 },
  bodyHeadingWrap: { marginLeft: -22 },
  bodyParagraph: {
    fontFamily: 'Geist',
    fontSize: 15,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: 'Geist',
    fontSize: 15,
    fontWeight: '600',
  },
  bodyInline: {
    fontFamily: 'Geist',
    fontSize: 15,
    lineHeight: 24,
  },
  cachedRow: {
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  cachedText: {
    fontFamily: 'GeistMono',
    fontSize: 11,
    fontStyle: 'italic',
  },
  errorWrap: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontFamily: 'Geist',
    fontSize: 14,
    textAlign: 'center',
  },
  retryLinkPress: { padding: 6 },
  retryLink: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  generateBlock: {
    paddingTop: 16,
    gap: 12,
  },
  generateBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontWeight: '600',
  },
  statusError: {
    fontFamily: 'Geist',
    fontSize: 12,
    textAlign: 'center',
  },
})
