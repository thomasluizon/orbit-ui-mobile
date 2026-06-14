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
import {
  AlertTriangle,
  Lightbulb,
  Lock,
  Orbit,
  Star,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import {
  getRetrospectiveCacheKey,
  RETROSPECTIVE_PERIODS,
  type RetrospectiveHabitStat,
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
import { StatTile } from '@/components/ui/stat-tile'

type Tokens = ReturnType<typeof createTokensV2>

const CACHE_VERSION_SUFFIX = '_v2'

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

function renderNarrativeInline(text: string, tokens: Tokens) {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      const strong = /^\*\*(.+?)\*\*$/.exec(part)
      if (strong) {
        return (
          <Text
            key={`${part}-${index}`}
            style={[styles.narrativeStrong, { color: tokens.fg1 }]}
          >
            {strong[1]}
          </Text>
        )
      }
      return (
        <Text key={`${part}-${index}`} style={{ color: tokens.fg2 }}>
          {part}
        </Text>
      )
    })
}

interface DashboardCardProps {
  tokens: Tokens
  title: string
  icon?: LucideIcon
  children: React.ReactNode
}

function DashboardCard({
  tokens,
  title,
  icon: Icon,
  children,
}: Readonly<DashboardCardProps>) {
  return (
    <View
      style={[
        styles.dashCard,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      <View style={styles.dashCardTitleRow}>
        {Icon ? (
          <Icon size={15} color={tokens.primary} strokeWidth={1.9} />
        ) : null}
        <Text style={[styles.dashCardTitle, { color: tokens.fg2 }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  )
}

interface WeeklyConsistencyProps {
  tokens: Tokens
  values: number[]
}

function WeeklyConsistency({
  tokens,
  values,
}: Readonly<WeeklyConsistencyProps>) {
  const { t } = useTranslation()
  return (
    <DashboardCard tokens={tokens} title={t('retrospective.weeklyTitle')}>
      <View style={styles.barsRow}>
        {values.map((value, index) => {
          const clamped = Math.max(0, Math.min(100, value))
          const letter = t(`dates.daysShort.${WEEKDAY_KEYS[index]}`).charAt(0)
          return (
            <View key={WEEKDAY_KEYS[index]} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: Math.max(6, (clamped / 100) * 64),
                      backgroundColor: tokens.primary,
                      opacity: clamped === 0 ? 0.25 : 1,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: tokens.fg3 }]}>
                {letter}
              </Text>
            </View>
          )
        })}
      </View>
    </DashboardCard>
  )
}

interface HabitStatListProps {
  tokens: Tokens
  title: string
  habits: RetrospectiveHabitStat[]
  tone: 'default' | 'attention'
}

function HabitStatList({
  tokens,
  title,
  habits,
  tone,
}: Readonly<HabitStatListProps>) {
  return (
    <DashboardCard tokens={tokens} title={title}>
      <View style={styles.habitList}>
        {habits.map((habit) => (
          <View key={habit.name} style={styles.habitRow}>
            <Text style={styles.habitEmoji}>{habit.emoji ?? '•'}</Text>
            <Text
              style={[styles.habitName, { color: tokens.fg1 }]}
              numberOfLines={1}
            >
              {habit.name}
            </Text>
            <Text
              style={[
                styles.habitRate,
                {
                  color:
                    tone === 'attention'
                      ? tokens.statusOverdueText
                      : tokens.fg2,
                },
              ]}
            >
              {habit.completionRate}%
            </Text>
          </View>
        ))}
      </View>
    </DashboardCard>
  )
}

interface NarrativeSectionProps {
  tokens: Tokens
  icon: LucideIcon
  title: string
  body: string
}

function NarrativeSection({
  tokens,
  icon,
  title,
  body,
}: Readonly<NarrativeSectionProps>) {
  return (
    <DashboardCard tokens={tokens} title={title} icon={icon}>
      <Text style={[styles.narrativeBody, { color: tokens.fg2 }]}>
        {renderNarrativeInline(body, tokens)}
      </Text>
    </DashboardCard>
  )
}

interface RetrospectiveLockedFreeProps {
  tokens: Tokens
  onSubscribe: () => void
}

function RetrospectiveLockedFree({
  tokens,
  onSubscribe,
}: Readonly<RetrospectiveLockedFreeProps>) {
  const { t } = useTranslation()
  return (
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
        onPress={onSubscribe}
        accessibilityLabel={t('upgrade.subscribe')}
        style={styles.lockedCta}
      >
        {t('upgrade.subscribe')}
      </PillButton>
    </View>
  )
}

interface RetrospectiveLockedYearlyProps {
  tokens: Tokens
  isTrialActive: boolean
  isOnline: boolean
  portalError: string
  onSubscribe: () => void
  onOpenPortal: () => void
}

function RetrospectiveLockedYearly({
  tokens,
  isTrialActive,
  isOnline,
  portalError,
  onSubscribe,
  onOpenPortal,
}: Readonly<RetrospectiveLockedYearlyProps>) {
  const { t } = useTranslation()
  return (
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
      {isTrialActive ? (
        <PillButton
          onPress={onSubscribe}
          accessibilityLabel={t('upgrade.subscribe')}
          style={styles.lockedCta}
        >
          {t('upgrade.subscribe')}
        </PillButton>
      ) : (
        <PillButton
          onPress={onOpenPortal}
          disabled={!isOnline}
          accessibilityLabel={t('retrospective.changePlan')}
          style={styles.lockedCta}
        >
          {t('retrospective.changePlan')}
        </PillButton>
      )}
      {!isOnline ? (
        <OfflineUnavailableState
          title={t('offline.title')}
          description={t('offline.description')}
          compact
        />
      ) : null}
      {portalError ? (
        <Text style={[styles.statusError, { color: tokens.statusBad }]}>
          {portalError}
        </Text>
      ) : null}
    </View>
  )
}

interface RetrospectiveDashboardProps {
  tokens: Tokens
  data: RetrospectiveResponse
  fromCache: boolean
  isOnline: boolean
  onRegenerate: () => void
}

function RetrospectiveDashboard({
  tokens,
  data,
  fromCache,
  isOnline,
  onRegenerate,
}: Readonly<RetrospectiveDashboardProps>) {
  const { t } = useTranslation()
  const { metrics, narrative } = data
  return (
    <View style={styles.contentWrap}>
      <Animated.View
        entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
        style={styles.dashStack}
      >
        <View style={styles.astraRow}>
          <View style={styles.astraEyebrowGroup}>
            <Orbit size={11} color={tokens.primary} strokeWidth={1.7} />
            <Text style={[styles.astraEyebrow, { color: tokens.fg3 }]}>
              {t('retrospective.astraEyebrow').toUpperCase()}
            </Text>
          </View>
          <Pressable
            onPress={onRegenerate}
            disabled={!isOnline}
            accessibilityRole="button"
            accessibilityLabel={t('retrospective.regenerate')}
            style={({ pressed }) => [
              styles.actionChip,
              {
                backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                borderColor: tokens.hairline,
              },
              pressed ? styles.actionChipPressed : null,
            ]}
          >
            <Text style={[styles.actionChipText, { color: tokens.fg2 }]}>
              {t('retrospective.regenerate')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.statTilesRow}>
          <StatTile
            emoji="🎯"
            value={`${metrics.completionRate}%`}
            label={t('retrospective.metrics.completionRate')}
          />
          <StatTile
            emoji="✅"
            value={metrics.totalCompletions}
            label={t('retrospective.metrics.logs')}
          />
          <StatTile
            emoji="🔥"
            value={metrics.currentStreak}
            label={t('retrospective.metrics.currentStreak')}
          />
        </View>

        <WeeklyConsistency tokens={tokens} values={metrics.weeklyConsistency} />

        {metrics.topHabits.length > 0 ? (
          <HabitStatList
            tokens={tokens}
            title={t('retrospective.topHabitsTitle')}
            habits={metrics.topHabits}
            tone="default"
          />
        ) : null}

        {metrics.needsAttention.length > 0 ? (
          <HabitStatList
            tokens={tokens}
            title={t('retrospective.needsAttentionTitle')}
            habits={metrics.needsAttention}
            tone="attention"
          />
        ) : null}

        <NarrativeSection
          tokens={tokens}
          icon={Star}
          title={t('retrospective.sections.highlights')}
          body={narrative.highlights}
        />
        <NarrativeSection
          tokens={tokens}
          icon={AlertTriangle}
          title={t('retrospective.sections.missed')}
          body={narrative.missed}
        />
        <NarrativeSection
          tokens={tokens}
          icon={TrendingUp}
          title={t('retrospective.sections.trends')}
          body={narrative.trends}
        />
        <NarrativeSection
          tokens={tokens}
          icon={Lightbulb}
          title={t('retrospective.sections.suggestion')}
          body={narrative.suggestion}
        />

        <Text style={[styles.aiDisclaimer, { color: tokens.fg3 }]}>
          {t('aiDisclosure.notMedicalAdvice')}
        </Text>
        {fromCache ? (
          <Text style={[styles.cachedText, { color: tokens.fg3 }]}>
            {t('retrospective.cached')}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  )
}

interface RetrospectiveContentProps {
  tokens: Tokens
  isOnline: boolean
  isLoading: boolean
  isCacheLoading: boolean
  period: RetrospectivePeriod
  periodChips: { id: RetrospectivePeriod; label: string }[]
  displayedData: RetrospectiveResponse | null
  displayedFromCache: boolean
  error: string | null
  noData: boolean
  onSelectPeriod: (next: RetrospectivePeriod) => void
  onGenerate: () => void
}

function RetrospectiveContent({
  tokens,
  isOnline,
  isLoading,
  isCacheLoading,
  period,
  periodChips,
  displayedData,
  displayedFromCache,
  error,
  noData,
  onSelectPeriod,
  onGenerate,
}: Readonly<RetrospectiveContentProps>) {
  const { t } = useTranslation()
  return (
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
              onPress={() => onSelectPeriod(p.id)}
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

      {!isLoading && displayedData ? (
        <RetrospectiveDashboard
          tokens={tokens}
          data={displayedData}
          fromCache={displayedFromCache}
          isOnline={isOnline}
          onRegenerate={onGenerate}
        />
      ) : null}

      {!isLoading && !displayedData && noData ? (
        <View style={styles.generateBlock}>
          <View style={styles.generateCardWrap}>
            <InfoCard
              icon={Orbit}
              title={t('retrospective.astraEyebrow')}
              desc={t('retrospective.noData')}
            />
          </View>
          <View style={styles.generateBtnWrap}>
            <PillButton
              onPress={onGenerate}
              disabled={!isOnline}
              fullWidth
              accessibilityLabel={t('retrospective.regenerate')}
              leading={
                <Orbit size={16} color={tokens.fgOnPrimary} strokeWidth={1.8} />
              }
            >
              {t('retrospective.regenerate')}
            </PillButton>
          </View>
        </View>
      ) : null}

      {!isLoading && !displayedData && !noData && error && (!displayedData || isOnline) ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {t('retrospective.error')}
          </Text>
          <Pressable
            onPress={onGenerate}
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
      !displayedData &&
      !error &&
      !noData &&
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
              onPress={onGenerate}
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
    if (!hasProAccess || !isYearlyPro) {
      router.replace('/upgrade')
    }
  }, [hasProAccess, isYearlyPro, profile, router])

  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey)
  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey)
    setIsCacheLoading(true)
  }

  useEffect(() => {
    let active = true

    AsyncStorage.getItem(cacheKey)
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
        backLabel={t('common.goBack')}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoaded && !hasProAccess ? (
          <RetrospectiveLockedFree
            tokens={tokens}
            onSubscribe={() => router.push(buildUpgradeHref('/retrospective'))}
          />
        ) : null}

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
            period={period}
            periodChips={periodChips}
            displayedData={displayedData}
            displayedFromCache={displayedFromCache}
            error={error}
            noData={noData}
            onSelectPeriod={selectPeriod}
            onGenerate={handleGenerate}
          />
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
  dashStack: {
    gap: 12,
  },
  statTilesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dashCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  dashCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dashCardTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 88,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: 22,
    borderRadius: 6,
  },
  barLabel: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  habitList: {
    gap: 10,
    marginTop: 14,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  habitName: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  habitRate: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  narrativeBody: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14.5,
    lineHeight: 23,
    marginTop: 10,
  },
  narrativeStrong: {
    fontFamily: 'Rubik_500Medium',
  },
  astraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: 4,
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
  cachedText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.22,
    fontVariant: ['tabular-nums'],
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
