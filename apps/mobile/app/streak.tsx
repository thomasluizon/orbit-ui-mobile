import { useState, useMemo, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X } from 'lucide-react-native'
import { subDays, isToday, format, parseISO } from 'date-fns'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { createColors, spacing } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import {
  useStreakFreeze,
  useActivateStreakFreeze,
} from '@/hooks/use-gamification'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useDateFormat } from '@/hooks/use-date-format'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { plural } from '@/lib/plural'
import { FreezeProgressCard, StreakTimelineCard } from './streak-sections'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

// ---------------------------------------------------------------------------
// Streak Screen
// ---------------------------------------------------------------------------

export default function StreakScreen() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const locale = useDeviceLocale()
  const { displayDate } = useDateFormat()
  const styles = useMemo(() => createStyles(colors), [colors])
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

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

  // Build 7-day timeline
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
        }
      }

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

  function getDayStyle(status: string) {
    switch (status) {
      case 'active':
        return {
          backgroundColor: 'rgba(34,197,94,0.15)',
          textColor: colors.green400,
          borderColor: 'rgba(34,197,94,0.25)',
          borderWidth: 1,
        }
      case 'frozen':
        return {
          backgroundColor: 'rgba(59,130,246,0.15)',
          textColor: colors.blue400,
          borderColor: 'rgba(59,130,246,0.25)',
          borderWidth: 1,
        }
      case 'today':
        return {
          backgroundColor: 'rgba(139,92,246,0.15)',
          textColor: colors.primary,
          borderColor: 'rgba(139,92,246,0.40)',
          borderWidth: 2,
        }
      default:
        return {
          backgroundColor: colors.surfaceElevated,
          textColor: colors.textMuted,
          borderColor: colors.borderMuted,
          borderWidth: 1,
        }
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goBackOrFallback('/profile')}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {t('streakDisplay.detail.title')}
          </Text>
        </View>

        {/* Loading */}
        {streakQuery.isLoading && !streakInfo ? (
          <View style={{ gap: 24 }}>
            <View style={[styles.skeletonBlock, { height: 128 }]} />
            <View style={[styles.skeletonBlock, { height: 80 }]} />
            <View style={[styles.skeletonBlock, { height: 96 }]} />
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            {/* Streak hero */}
            <View style={styles.streakHero}>
              {/* Flame */}
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                {streak > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Svg viewBox="0 0 40 50" width={64} height={64}>
                      <Defs>
                        <LinearGradient
                          id="streakDetailFlame"
                          x1="20"
                          y1="0"
                          x2="20"
                          y2="50"
                          gradientUnits="userSpaceOnUse"
                        >
                          <Stop offset="0" stopColor="#fbbf24" />
                          <Stop offset="0.5" stopColor="#f97316" />
                          <Stop offset="1" stopColor="#ef4444" />
                        </LinearGradient>
                      </Defs>
                      <Path
                        d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                        fill="url(#streakDetailFlame)"
                      />
                    </Svg>
                  </View>
                ) : (
                  <View style={styles.emptyFlame}>
                    <Svg viewBox="0 0 40 50" width={40} height={40}>
                      <Path
                        d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                        fill={colors.textMuted}
                        opacity={0.3}
                      />
                    </Svg>
                  </View>
                )}

                {/* Count */}
                <Text style={styles.heroCount}>{streak}</Text>
                <Text style={styles.heroDaysUnit}>
                  {plural(
                    t('streakDisplay.detail.daysUnit', { count: streak }),
                    streak,
                  )}
                </Text>
                {encouragement ? (
                  <Text style={styles.heroEncouragement}>{encouragement}</Text>
                ) : null}
              </View>
            </View>

            {/* Weekly timeline */}
            <StreakTimelineCard
              t={t}
              weekDays={weekDays}
              styles={styles}
              getDayStyle={getDayStyle}
            />

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.amber400 }]}>
                  {streak}
                </Text>
                <Text style={styles.statLabel}>
                  {t('streakDisplay.detail.currentStreak').toUpperCase()}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text
                  style={[styles.statValue, { color: 'rgba(245,158,11,0.6)' }]}
                >
                  {streakInfo?.longestStreak ?? 0}
                </Text>
                <Text style={styles.statLabel}>
                  {t('streakDisplay.detail.longestStreak').toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Freeze section */}
            <FreezeProgressCard
              t={t}
              locale={locale}
              streak={streak}
              streakFreezesAccumulated={streakFreezesAccumulated}
              maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
              daysUntilNextFreeze={daysUntilNextFreeze}
              freezesAvailable={freezesAvailable}
              freezesUsedThisMonth={freezesUsedThisMonth}
              maxFreezesPerMonth={maxFreezesPerMonth}
              isFrozenToday={isFrozenToday}
              hasCompletedToday={hasCompletedToday}
              canFreeze={canFreeze}
              canEarnMore={canEarnMore}
              hasReachedMonthlyLimit={hasReachedMonthlyLimit}
              freezeSuccess={freezeSuccess}
              errorMessage={activateFreezeMutation.error?.message}
              streakInfo={streakInfo}
              onActivateFreeze={() => setShowConfirm(true)}
            />
          </View>
        )}
      </ScrollView>

      {/* Freeze confirmation modal */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('streakDisplay.freeze.confirmTitle')}
              </Text>
              <TouchableOpacity onPress={() => setShowConfirm(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              {t('streakDisplay.freeze.confirmBody', {
                streak,
                remaining: freezesAvailable,
                count: freezesAvailable,
              })}
            </Text>
            <View style={{ gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.freezeConfirmButton}
                onPress={handleFreeze}
                disabled={activateFreezeMutation.isPending}
                activeOpacity={0.8}
              >
                <Text style={styles.freezeConfirmButtonText}>
                  {activateFreezeMutation.isPending
                    ? '...'
                    : t('streakDisplay.freeze.activate')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowConfirm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.pageX,
      paddingBottom: spacing.pageBottom,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.cardGap,
      paddingTop: spacing.sectionGap * 2,
      paddingBottom: spacing.cardGap * 2,
    },
    backButton: { padding: 8, marginLeft: -8, borderRadius: 999 },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },

    skeletonBlock: {
      backgroundColor: colors.surface,
      borderRadius: 20,
    },

    // Streak hero
    streakHero: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      overflow: 'hidden',
    },
    emptyFlame: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    heroCount: {
      fontSize: 36,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    heroDaysUnit: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    heroEncouragement: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
      marginTop: 8,
    },

    // Card
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: spacing.cardPadding,
      gap: spacing.cardGap,
    },
    sectionLabelSmall: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },

    // Week grid
    weekGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 4,
    },
    weekDayCol: {
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    weekDayLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    weekDayCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekDayNum: {
      fontSize: 14,
      fontWeight: '700',
    },

    // Legend
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 10, color: colors.textMuted },

    // Stats
    statsRow: { flexDirection: 'row', gap: spacing.cardGap },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 16,
      alignItems: 'center',
    },
    statValue: { fontSize: 24, fontWeight: '800' },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 4,
    },

    // Freeze
    freezeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    freezeIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    freezeTitle: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    freezeAvailable: {
      flexShrink: 1,
      maxWidth: '46%',
      fontSize: 11,
      lineHeight: 15,
      color: colors.textMuted,
      textAlign: 'right',
    },

    frozenTodayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(59,130,246,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.15)',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    frozenTodayText: { fontSize: 12, fontWeight: '700', color: colors.blue400 },

    freezeButton: {
      backgroundColor: 'rgba(59,130,246,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.20)',
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
    },
    freezeButtonDisabled: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderMuted,
      opacity: 0.5,
    },
    freezeButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.blue400,
    },

    completedTodayText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.green400,
      textAlign: 'center',
    },
    freezeSuccessText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.blue400,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 12,
      color: colors.red400,
      textAlign: 'center',
    },

    // Recent freezes
    recentFreezes: {
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.05)',
      gap: 6,
    },
    recentLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    recentDateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    recentDateChip: {
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    recentDateText: { fontSize: 10, color: colors.textMuted },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    modalDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    freezeConfirmButton: {
      backgroundColor: 'rgba(59,130,246,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.25)',
      borderRadius: 20,
      paddingVertical: 14,
      alignItems: 'center',
    },
    freezeConfirmButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.blue400,
    },
    cancelButton: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
  })
}
