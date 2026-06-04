import { useMemo, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { subDays, isToday, format, parseISO } from 'date-fns'
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
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { StreakWeekTimeline, FreezeSection } from './streak-sections'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

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
  } = useStreakFreeze(profile)
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
      const dayLabel = displayDate(date, { weekday: 'short' })
        .slice(0, 1)
        .toUpperCase()
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

  const tier = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.detail.tierLegendary')
    if (streak >= 30) return t('streakDisplay.detail.tierStrong')
    if (streak >= 7) return t('streakDisplay.detail.tierSteady')
    return t('streakDisplay.detail.tierNormal')
  }, [streak, t])

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
          <View style={{ gap: 24, padding: 20 }}>
            <View style={[styles.skeletonBlock, { height: 128, backgroundColor: tokens.bgSunk }]} />
            <View style={[styles.skeletonBlock, { height: 80, backgroundColor: tokens.bgSunk }]} />
            <View style={[styles.skeletonBlock, { height: 96, backgroundColor: tokens.bgSunk }]} />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
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
              <Text
                style={[
                  styles.heroNumber,
                  {
                    color: tokens.fg1,
                    fontSize: streak > 100 ? 64 : 80,
                  },
                ]}
              >
                {streak}
              </Text>
              <Text style={[styles.heroDays, { color: tokens.fg3 }]}>
                {plural(t('streakDisplay.detail.daysUnit'), streak)}
              </Text>
              {encouragement ? (
                <Text style={[styles.heroEncouragement, { color: tokens.fg3 }]}>
                  {encouragement}
                </Text>
              ) : null}
            </View>

            <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
            <View style={styles.groupWrap}>
              <View
                style={[
                  styles.weekCard,
                  {
                    backgroundColor: tokens.bgElev,
                    borderColor: tokens.hairline,
                  },
                ]}
              >
                <StreakWeekTimeline
                  weekDays={weekDays}
                  tokens={tokens}
                  legend={{
                    active: t('streakDisplay.detail.dayActive'),
                    frozen: t('streakDisplay.detail.dayFrozen'),
                    missed: t('streakDisplay.detail.dayMissed'),
                  }}
                />
              </View>
            </View>

            <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
            <View style={styles.groupWrap}>
              <SettingsGroup>
                <SettingsGroupRow
                  label={t('streakDisplay.detail.currentStreak')}
                  accessory="none"
                  trailing={
                    <Text style={[styles.statValue, { color: tokens.fg3 }]}>
                      {streak}
                    </Text>
                  }
                />
                <SettingsGroupRow
                  label={t('streakDisplay.detail.longestStreak')}
                  accessory="none"
                  trailing={
                    <Text style={[styles.statValue, { color: tokens.fg3 }]}>
                      {streakInfo?.longestStreak ?? 0}
                    </Text>
                  }
                />
                <SettingsGroupRow
                  label={tier}
                  accessory="none"
                  trailing={
                    <View
                      style={[
                        styles.tierDot,
                        { backgroundColor: tokens.primary },
                      ]}
                    />
                  }
                />
              </SettingsGroup>
            </View>

            <SectionLabel
              trailing={
                <Text
                  style={[styles.autoChip, { color: tokens.statusFrozen }]}
                >
                  {t('streakDisplay.freeze.auto.chip')}
                </Text>
              }
            >
              {t('streakDisplay.freeze.title')}
            </SectionLabel>
            <FreezeSection
              t={t}
              tokens={tokens}
              isPro={isPro}
              streak={streak}
              freezesUsedThisMonth={freezesUsedThisMonth}
              maxFreezesPerMonth={maxFreezesPerMonth}
              streakFreezesAccumulated={streakFreezesAccumulated}
              maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
              isFrozenToday={isFrozenToday}
              protectedDates={streakInfo?.recentFreezeDates ?? []}
              onUpgrade={() => router.push(buildUpgradeHref('/streak'))}
              displayDate={displayDate}
            />

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </SafeAreaView>
  )
}

function createStyles(_tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: {
      paddingBottom: 40,
    },
    skeletonBlock: {
      borderRadius: 8,
    },
    hero: {
      paddingHorizontal: 20,
      paddingTop: 32,
      paddingBottom: 28,
      alignItems: 'center',
      gap: 8,
    },
    heroEyebrow: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.66,
    },
    heroNumber: {
      fontFamily: 'GeistMono',
      fontWeight: '500',
      letterSpacing: -3.2,
      lineHeight: 72,
      fontVariant: ['tabular-nums'],
    },
    heroDays: {
      fontFamily: 'Geist',
      fontSize: 14,
    },
    heroEncouragement: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 4,
    },
    groupWrap: {
      paddingHorizontal: 20,
    },
    weekCard: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 14,
    },
    statValue: {
      fontFamily: 'GeistMono',
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    tierDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    autoChip: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.66,
    },
  })
}
