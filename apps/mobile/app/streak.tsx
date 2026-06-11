import { useMemo, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { Snowflake } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { useDateFormat } from '@/hooks/use-date-format'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { plural } from '@/lib/plural'
import { AppBar } from '@/components/ui/app-bar'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { StreakStatsRow, StreakTimelineCard, FreezeProgressCard } from './streak-sections'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

type Tokens = ReturnType<typeof createTokensV2>

export default function StreakScreen() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const isPro = profile?.hasProAccess ?? false
  const { displayDate } = useDateFormat()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const {
    streakQuery,
    streakInfo,
    isFrozenToday,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
  } = useStreakFreeze(profile, isPro)
  const freezeCelebrationRef = useRef<StreakFreezeCelebrationHandle>(null)
  const wasFrozenTodayRef = useRef(isFrozenToday)

  useEffect(() => {
    if (isFrozenToday && !wasFrozenTodayRef.current) {
      freezeCelebrationRef.current?.show()
    }
    wasFrozenTodayRef.current = isFrozenToday
  }, [isFrozenToday])

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.profile.encouragement100')
    if (streak >= 30) return t('streakDisplay.profile.encouragement30')
    if (streak >= 14) return t('streakDisplay.profile.encouragement14')
    if (streak >= 7) return t('streakDisplay.profile.encouragement7')
    if (streak >= 1) return t('streakDisplay.profile.encouragement1')
    return ''
  }, [streak, t])

  const weekDays = useMemo(() => {
    const today = new Date()
    const freezeDates = new Set(streakInfo?.recentFreezeDates ?? [])
    const lastActive = streakInfo?.lastActiveDate
    const lastActiveDate = lastActive ? parseISO(lastActive) : null
    const currentStreak = streak

    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayLabel = displayDate(date, { weekday: 'short' }).slice(0, 3)
      const dayNum = String(date.getDate())
      const isTodayDate = isToday(date)

      let status: 'active' | 'frozen' | 'missed' | 'today' | 'future' = 'missed'

      if (isTodayDate) {
        if (isFrozenToday) status = 'frozen'
        else if (lastActiveDate && isToday(lastActiveDate)) status = 'active'
        else status = 'today'
      } else if (freezeDates.has(dateStr)) {
        status = 'frozen'
      } else if (lastActiveDate && currentStreak > 0) {
        const streakStart = subDays(lastActiveDate, currentStreak - 1)
        if (date >= streakStart && date <= lastActiveDate) {
          status = 'active'
        } else if (date < today) {
          status = 'missed'
        }
      } else if (date > today) {
        status = 'future'
      }

      if (date > today && !isTodayDate) status = 'future'

      return { date, dateStr, dayLabel, dayNum, status, isTodayDate }
    })
  }, [streakInfo, streak, isFrozenToday, displayDate])

  const heroEyebrow = isFrozenToday
    ? t('streakDisplay.freeze.activeToday')
    : t('streakDisplay.detail.currentStreak')

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('streakDisplay.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {streakQuery.isLoading && !streakInfo ? (
          <View style={styles.skeletonStack}>
            <View style={[styles.skeletonBlock, { height: 128, backgroundColor: tokens.bgCard }]} />
            <View style={[styles.skeletonBlock, { height: 80, backgroundColor: tokens.bgCard }]} />
            <View style={[styles.skeletonBlock, { height: 96, backgroundColor: tokens.bgCard }]} />
          </View>
        ) : (
          <>
            {isFrozenToday ? (
              <View style={styles.frozenBannerWrap}>
                <View
                  style={[
                    styles.frozenBanner,
                    {
                      backgroundColor: frozenTint(tokens, 0.1),
                      borderColor: frozenTint(tokens, 0.28),
                    },
                  ]}
                >
                  <Snowflake size={24} strokeWidth={1.9} color={tokens.statusFrozen} />
                  <Text style={[styles.frozenBannerTitle, { color: tokens.fg1 }]}>
                    {t('streakDisplay.freeze.activeToday')}
                  </Text>
                </View>
              </View>
            ) : null}

            <Animated.View entering={sectionEntrance(0)} style={styles.hero}>
              <Text
                style={[
                  styles.heroEyebrow,
                  {
                    color: isFrozenToday ? tokens.statusFrozen : tokens.fg3,
                  },
                ]}
              >
                {heroEyebrow.toUpperCase()}
              </Text>
              <View
                style={[
                  styles.heroWell,
                  { backgroundColor: heroWellTint(tokens.fg1) },
                ]}
                accessibilityElementsHidden
              >
                {streak === 0 ? (
                  <SatelliteGlyph size={56} />
                ) : (
                  <Text style={styles.heroEmoji}>🔥</Text>
                )}
              </View>
              <View style={styles.heroCountRow}>
                <Text style={[styles.heroNumber, { color: tokens.fg1 }]}>
                  {streak}
                </Text>
                <Text style={[styles.heroUnit, { color: tokens.fg2 }]}>
                  {plural(t('streakDisplay.detail.daysUnit'), streak)}
                </Text>
              </View>
              {encouragement ? (
                <Text style={[styles.heroEncouragement, { color: tokens.fg3 }]}>
                  {encouragement}
                </Text>
              ) : null}
            </Animated.View>

            <Animated.View entering={sectionEntrance(1)}>
              <StreakStatsRow
                t={t}
                streak={streak}
                longestStreak={streakInfo?.longestStreak ?? 0}
              />
            </Animated.View>

            <Animated.View entering={sectionEntrance(2)}>
              <StreakTimelineCard t={t} weekDays={weekDays} />
            </Animated.View>

            <Animated.View entering={sectionEntrance(3)}>
              <FreezeProgressCard
                t={t}
                isPro={isPro}
                streak={streak}
                streakFreezesAccumulated={streakFreezesAccumulated}
                maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
                freezesUsedThisMonth={freezesUsedThisMonth}
                maxFreezesPerMonth={maxFreezesPerMonth}
                isFrozenToday={isFrozenToday}
                protectedDates={streakInfo?.recentFreezeDates ?? []}
                onUpgrade={() => router.push(buildUpgradeHref('/streak'))}
                displayDate={displayDate}
              />
            </Animated.View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </SafeAreaView>
  )
}

function frozenTint(tokens: Tokens, alpha: number): string {
  const normalized = tokens.statusFrozen.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function heroWellTint(fg1Hex: string): string {
  const normalized = fg1Hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, 0.06)`
}

function createStyles(_tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: {
      paddingBottom: 40,
    },
    skeletonStack: {
      gap: 24,
      padding: 20,
    },
    skeletonBlock: {
      borderRadius: 18,
    },
    frozenBannerWrap: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    frozenBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    frozenBannerTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      flexShrink: 1,
    },
    hero: {
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 24,
      alignItems: 'center',
      gap: 14,
    },
    heroEyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
    },
    heroWell: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: 10,
    },
    heroEmoji: {
      fontSize: 30,
      lineHeight: 36,
    },
    heroNumber: {
      fontFamily: 'Inter_700Bold',
      fontSize: 64,
      letterSpacing: -1.28,
      lineHeight: 68,
      fontVariant: ['tabular-nums'],
    },
    heroUnit: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      lineHeight: 26,
    },
    heroEncouragement: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      textAlign: 'center',
    },
  })
}
