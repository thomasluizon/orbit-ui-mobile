import { useState, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import {
  useStreakFreeze,
  useActivateStreakFreeze,
} from '@/hooks/use-gamification'
import { useDateFormat } from '@/hooks/use-date-format'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { plural } from '@/lib/plural'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ConfirmDialogV2 } from '@/components/ui/confirm-dialog-v2'
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
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const { displayDate } = useDateFormat()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const {
    streakQuery,
    streakInfo,
    freezesAvailable,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    canEarnMore,
    hasReachedMonthlyLimit,
  } = useStreakFreeze(profile)
  const activateFreezeMutation = useActivateStreakFreeze()
  const freezeCelebrationRef = useRef<StreakFreezeCelebrationHandle>(null)

  const [showConfirm, setShowConfirm] = useState(false)
  const [freezeSuccess, setFreezeSuccess] = useState(false)

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

  async function handleFreeze() {
    setShowConfirm(false)
    try {
      await activateFreezeMutation.mutateAsync()
      setFreezeSuccess(true)
      setTimeout(() => setFreezeSuccess(false), 3000)
      freezeCelebrationRef.current?.show()
    } catch {
      // Error handled by mutation
    }
  }

  const heroEyebrow = isFrozenToday
    ? t('streakDisplay.freeze.activeToday')
    : t('streakDisplay.detail.currentStreak')

  const tier = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return 'Legendary'
    if (streak >= 30) return 'Strong'
    if (streak >= 7) return 'Steady'
    return 'Normal'
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
            <View
              style={[
                styles.hero,
                { borderBottomColor: tokens.hairline },
              ]}
            >
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
              {encouragement ? (
                <Text style={[styles.heroEncouragement, { color: tokens.fg3 }]}>
                  {encouragement}
                </Text>
              ) : null}
            </View>

            <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
            <StreakWeekTimeline weekDays={weekDays} tokens={tokens} />

            <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>
            <FreezeSection
              t={t}
              tokens={tokens}
              streak={streak}
              freezesAvailable={freezesAvailable}
              freezesUsedThisMonth={freezesUsedThisMonth}
              maxFreezesPerMonth={maxFreezesPerMonth}
              streakFreezesAccumulated={streakFreezesAccumulated}
              maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
              daysUntilNextFreeze={daysUntilNextFreeze}
              isFrozenToday={isFrozenToday}
              hasCompletedToday={hasCompletedToday}
              canFreeze={canFreeze}
              canEarnMore={canEarnMore}
              hasReachedMonthlyLimit={hasReachedMonthlyLimit}
              freezeSuccess={freezeSuccess}
              errorMessage={activateFreezeMutation.error?.message ?? null}
              onActivateFreeze={() => setShowConfirm(true)}
            />

            <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
            <View
              style={[
                styles.tierRow,
                { borderBottomColor: tokens.hairline },
              ]}
            >
              <View
                style={[styles.tierDot, { backgroundColor: tokens.primary }]}
              />
              <Text style={[styles.tierLabel, { color: tokens.fg1 }]}>
                {tier}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.tierMeta, { color: tokens.fg3 }]}>
                {plural(
                  t('streakDisplay.profile.longestStreak', {
                    count: streakInfo?.longestStreak ?? 0,
                  }),
                  streakInfo?.longestStreak ?? 0,
                )}
              </Text>
            </View>

            {streakInfo?.recentFreezeDates &&
            streakInfo.recentFreezeDates.length > 0 ? (
              <>
                <SectionLabel>
                  {t('streakDisplay.freeze.recentLabel')}
                </SectionLabel>
                {streakInfo.recentFreezeDates.slice(0, 5).map((date) => (
                  <SettingsRow
                    key={date}
                    label={displayDate(date, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    accessory="none"
                    mono
                  />
                ))}
              </>
            ) : null}

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      <ConfirmDialogV2
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t('streakDisplay.freeze.confirmTitle')}
        body={t('streakDisplay.freeze.confirmBody', {
          streak,
          remaining: freezesAvailable,
          count: freezesAvailable,
        })}
        cancelLabel={t('common.cancel')}
        actionLabel={t('streakDisplay.freeze.activate')}
        onAction={() => {
          void handleFreeze()
        }}
      />
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
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
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
    heroEncouragement: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    tierRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tierDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    tierLabel: {
      fontFamily: 'Geist',
      fontSize: 15,
    },
    tierMeta: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
  })
}
