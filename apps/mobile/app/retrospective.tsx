import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lock, Orbit } from 'lucide-react-native'
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
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { Chip } from '@/components/ui/chip'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'

type Tokens = ReturnType<typeof createTokensV2>

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
            <Text
              key={`${line}-${index}`}
              style={[
                styles.bodyHeading,
                { color: tokens.fg1 },
                index > 0 ? styles.bodyHeadingSpaced : null,
              ]}
            >
              {headingMatch[1]}
            </Text>
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
                { backgroundColor: tintFromPrimary(tokens, 0.16) },
              ]}
            >
              <Lock size={30} color={tokens.primarySoft} strokeWidth={1.8} />
            </View>
            <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
              {t('retrospective.locked')}
            </Text>
            <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
              {t('retrospective.lockedHint')}
            </Text>
            <PillButton
              onPress={() => router.push(buildUpgradeHref('/retrospective'))}
              accessibilityLabel={t('upgrade.subscribe')}
              style={styles.lockedCta}
            >
              {t('upgrade.subscribe')}
            </PillButton>
          </View>
        ) : null}

        {isLoaded && hasProAccess && !isYearlyPro ? (
          <View style={styles.lockedBlock}>
            <View
              style={[
                styles.lockedIconCircle,
                { backgroundColor: tintFromPrimary(tokens, 0.16) },
              ]}
            >
              <Lock size={30} color={tokens.primarySoft} strokeWidth={1.8} />
            </View>
            <Text style={[styles.lockedTitle, { color: tokens.fg1 }]}>
              {t('retrospective.lockedYearly')}
            </Text>
            <Text style={[styles.lockedDescription, { color: tokens.fg3 }]}>
              {t('retrospective.lockedYearlyHint')}
            </Text>
            {profile?.isTrialActive ? (
              <PillButton
                onPress={() => router.push(buildUpgradeHref('/retrospective'))}
                accessibilityLabel={t('upgrade.subscribe')}
                style={styles.lockedCta}
              >
                {t('upgrade.subscribe')}
              </PillButton>
            ) : (
              <PillButton
                onPress={() => {
                  void handleOpenPortal()
                }}
                disabled={!isOnline}
                accessibilityLabel={t('retrospective.changePlan')}
                style={styles.lockedCta}
              >
                {t('retrospective.changePlan')}
              </PillButton>
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
                    { width: '60%', backgroundColor: tokens.bgCard },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonLine,
                    { width: '80%', backgroundColor: tokens.bgCard },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonLine,
                    { width: '40%', backgroundColor: tokens.bgCard },
                  ]}
                />
              </View>
            ) : null}

            {!isLoading && displayedRetrospective ? (
              <View style={styles.contentWrap}>
                <Animated.View
                  entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
                  style={[
                    styles.contentCard,
                    {
                      backgroundColor: tokens.bgCard,
                      borderColor: tokens.hairline,
                    },
                  ]}
                >
                  <View style={styles.astraRow}>
                    <View style={styles.astraEyebrowGroup}>
                      <Orbit size={11} color={tokens.primary} strokeWidth={1.7} />
                      <Text
                        style={[styles.astraEyebrow, { color: tokens.fg3 }]}
                      >
                        {t('retrospective.astraEyebrow').toUpperCase()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleGenerate}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.actionChip,
                        {
                          backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                          borderColor: tokens.hairline,
                        },
                        pressed ? styles.actionChipPressed : null,
                      ]}
                    >
                      <Text
                        style={[styles.actionChipText, { color: tokens.fg2 }]}
                      >
                        {t('retrospective.regenerate')}
                      </Text>
                    </Pressable>
                  </View>
                  <RetrospectiveBody
                    text={displayedRetrospective}
                    tokens={tokens}
                  />
                  <Text style={[styles.aiDisclaimer, { color: tokens.fg4 }]}>
                    {t('aiDisclosure.notMedicalAdvice')}
                  </Text>
                  {displayedFromCache ? (
                    <Text
                      style={[styles.cachedText, { color: tokens.fg4 }]}
                    >
                      {t('retrospective.cached')}
                    </Text>
                  ) : null}
                </Animated.View>
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
                  style={({ pressed }) => [
                    styles.actionChip,
                    {
                      backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                      borderColor: tokens.hairline,
                    },
                    pressed ? styles.actionChipPressed : null,
                  ]}
                >
                  <Text style={[styles.actionChipText, { color: tokens.fg1 }]}>
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
                <View style={styles.generateCardWrap}>
                  <InfoCard
                    icon={Orbit}
                    title={t('retrospective.astraEyebrow')}
                    desc={t('retrospective.empty')}
                  />
                </View>
                <View style={styles.generateBtnWrap}>
                  <PillButton
                    onPress={handleGenerate}
                    disabled={!isOnline}
                    fullWidth
                    accessibilityLabel={t('retrospective.generate')}
                    leading={
                      <Orbit
                        size={16}
                        color={tokens.fgOnPrimary}
                        strokeWidth={1.8}
                      />
                    }
                  >
                    {t('retrospective.generate')}
                  </PillButton>
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
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  lockedDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  lockedCta: {
    marginTop: 8,
  },
  tabsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsScroll: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  skeletonLine: {
    height: 7,
    borderRadius: 4,
    alignSelf: 'stretch',
  },
  contentWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  contentCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  astraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  astraEyebrowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  astraEyebrow: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 10.5,
    letterSpacing: 0.63,
  },
  aiDisclaimer: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 16,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  actionChipText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  bodyStack: { gap: 6 },
  bodyHeading: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 22,
  },
  bodyHeadingSpaced: {
    marginTop: 10,
  },
  bodyParagraph: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
  },
  bodyInline: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 24,
  },
  cachedText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.22,
    fontVariant: ['tabular-nums'],
    marginTop: 10,
  },
  errorWrap: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  generateBlock: {
    paddingTop: 20,
  },
  generateCardWrap: {
    paddingHorizontal: 20,
  },
  generateBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  statusError: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})
