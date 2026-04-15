import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg'
import { Info, Shield, Snowflake, Sparkles, X } from 'lucide-react-native'
import { formatLocaleDate } from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today' | 'future'
}

type StreakInfoView = {
  recentFreezeDates?: string[] | null
}

interface StreakScreenStyles {
  card: StyleProp<ViewStyle>
  sectionLabelSmall: StyleProp<TextStyle>
  weekGrid: StyleProp<ViewStyle>
  weekDayCol: StyleProp<ViewStyle>
  weekDayLabel: StyleProp<TextStyle>
  weekDayCircle: StyleProp<ViewStyle>
  weekDayNum: StyleProp<TextStyle>
  legendRow: StyleProp<ViewStyle>
  legendItem: StyleProp<ViewStyle>
  legendDot: StyleProp<ViewStyle>
  legendText: StyleProp<TextStyle>
}

type DayStyle = {
  backgroundColor: string
  textColor: string
  borderColor: string
  borderWidth: number
}

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
  styles: StreakScreenStyles
  getDayStyle: (status: StreakDayView['status']) => DayStyle
}

export function StreakTimelineCard({
  t,
  weekDays,
  styles,
  getDayStyle,
}: StreakTimelineCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabelSmall}>{t('streakDisplay.detail.thisWeek').toUpperCase()}</Text>
      <View style={styles.weekGrid}>
        {weekDays.map((day) => {
          const dayStyle = getDayStyle(day.status)
          return (
            <View key={day.dateStr} style={styles.weekDayCol}>
              <Text style={styles.weekDayLabel}>{day.dayLabel}</Text>
              <View
                style={[
                  styles.weekDayCircle,
                  {
                    backgroundColor: dayStyle.backgroundColor,
                    borderColor: dayStyle.borderColor,
                    borderWidth: dayStyle.borderWidth,
                  },
                ]}
              >
                <Text style={[styles.weekDayNum, { color: dayStyle.textColor }]}>
                  {day.dayNum}
                </Text>
              </View>
            </View>
          )
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendText}>{t('streakDisplay.detail.dayActive')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.legendText}>{t('streakDisplay.detail.dayFrozen')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#6b7280' }]} />
          <Text style={styles.legendText}>{t('streakDisplay.detail.dayMissed')}</Text>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// FreezeProgressCard
// ---------------------------------------------------------------------------

const RING_SIZE = 144
const RING_STROKE = 10
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface FreezeProgressCardProps {
  t: TranslationFn
  locale: string
  streak: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  daysUntilNextFreeze: number
  freezesAvailable: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  canFreeze: boolean
  canEarnMore: boolean
  hasReachedMonthlyLimit: boolean
  freezeSuccess: boolean
  errorMessage?: string | null
  streakInfo: StreakInfoView | null
  onActivateFreeze: () => void
}

export function FreezeProgressCard(props: FreezeProgressCardProps) {
  const {
    t,
    locale,
    streak,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesAvailable,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
    canEarnMore,
    hasReachedMonthlyLimit,
    freezeSuccess,
    errorMessage,
    streakInfo,
    onActivateFreeze,
  } = props

  const { colors } = useAppTheme()
  const styles = createFreezeStyles(colors)
  const [infoOpen, setInfoOpen] = useState(false)

  const daysEarned = Math.max(0, 7 - daysUntilNextFreeze)
  const ringProgress = canEarnMore ? Math.min(1, daysEarned / 7) : 1
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringProgress)

  const subtitle = (() => {
    if (!canEarnMore) {
      return t('streakDisplay.freeze.maxAccumulated', { max: maxStreakFreezesAccumulated })
    }
    if (streak <= 0) return t('streakDisplay.freeze.noFreezesAvailable')
    if (daysUntilNextFreeze === 0) return t('streakDisplay.freeze.progressReady')
    return t('streakDisplay.freeze.progressSubtitle', {
      days: daysUntilNextFreeze,
      count: daysUntilNextFreeze,
    })
  })()

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Snowflake size={16} color={colors.blue400 ?? '#60a5fa'} />
          <Text style={styles.title}>{t('streakDisplay.freeze.title')}</Text>
        </View>
        <TouchableOpacity
          style={styles.infoButton}
          activeOpacity={0.7}
          onPress={() => setInfoOpen(true)}
        >
          <Info size={14} color={colors.textSecondary} />
          <Text style={styles.infoButtonText}>{t('streakDisplay.freeze.learnMore')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.ringWrap}>
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          >
            <Defs>
              <LinearGradient id="freezeRingGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#60a5fa" />
                <Stop offset="0.6" stopColor="#3b82f6" />
                <Stop offset="1" stopColor="#1d4ed8" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.borderMuted}
              strokeWidth={RING_STROKE}
              fill="transparent"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="url(#freezeRingGradient)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              fill="transparent"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringContent}>
            {canEarnMore ? (
              <>
                <Text style={styles.ringEyebrow}>
                  {t('streakDisplay.freeze.progressTitle').toUpperCase()}
                </Text>
                <View style={styles.ringCountRow}>
                  <Text style={styles.ringCount}>{daysEarned}</Text>
                  <Text style={styles.ringCountDen}>/7</Text>
                </View>
                <Text style={styles.ringMeta}>
                  {t('streakDisplay.freeze.dayStreak', { count: streak })}
                </Text>
              </>
            ) : (
              <>
                <Sparkles size={18} color="#93c5fd" />
                <Text style={styles.maxBadge}>MAX</Text>
                <Text style={styles.ringMeta}>
                  {maxStreakFreezesAccumulated}/{maxStreakFreezesAccumulated}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>
            {canEarnMore
              ? t('streakDisplay.freeze.progressTitle')
              : t('streakDisplay.freeze.title')}
          </Text>
          <Text style={styles.heroSubtitle}>{subtitle}</Text>

          <View style={styles.shieldRow}>
            {Array.from({ length: maxStreakFreezesAccumulated }, (_, i) => {
              const active = i < streakFreezesAccumulated
              return (
                <View
                  key={i}
                  style={[styles.shield, active ? styles.shieldActive : styles.shieldInactive]}
                >
                  <Shield
                    size={16}
                    color={active ? '#93c5fd' : colors.textMuted}
                    fill={active ? '#93c5fd' : 'transparent'}
                    strokeWidth={1.75}
                  />
                </View>
              )
            })}
            <Text style={styles.shieldCount}>
              {t('streakDisplay.freeze.accumulatedShort', {
                count: streakFreezesAccumulated,
                max: maxStreakFreezesAccumulated,
              })}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <View
          style={[
            styles.monthlyBadge,
            hasReachedMonthlyLimit ? styles.monthlyBadgeDanger : styles.monthlyBadgeNeutral,
          ]}
        >
          <View
            style={[
              styles.badgeDot,
              hasReachedMonthlyLimit ? styles.badgeDotDanger : styles.badgeDotNeutral,
            ]}
          />
          <Text
            style={[
              styles.monthlyText,
              hasReachedMonthlyLimit ? styles.monthlyTextDanger : styles.monthlyTextNeutral,
            ]}
          >
            {t('streakDisplay.freeze.monthlyUsage', {
              used: freezesUsedThisMonth,
              max: maxFreezesPerMonth,
            })}
          </Text>
        </View>

        {isFrozenToday ? (
          <View style={styles.activeTodayBadge}>
            <Snowflake size={12} color="#60a5fa" />
            <Text style={styles.activeTodayText}>
              {t('streakDisplay.freeze.activeToday')}
            </Text>
          </View>
        ) : null}
      </View>

      {streak > 0 && !isFrozenToday ? (
        <TouchableOpacity
          style={[styles.activateButton, !canFreeze && styles.activateButtonDisabled]}
          disabled={!canFreeze}
          activeOpacity={0.85}
          onPress={onActivateFreeze}
        >
          <Text
            style={[
              styles.activateButtonText,
              !canFreeze && styles.activateButtonTextDisabled,
            ]}
          >
            {t('streakDisplay.freeze.activate')}
          </Text>
          {freezesAvailable > 0 ? (
            <View style={styles.activatePill}>
              <Text style={styles.activatePillText}>{freezesAvailable}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {hasCompletedToday && !isFrozenToday && streak > 0 ? (
        <Text style={styles.statusSuccess}>
          {t('streakDisplay.freeze.completedToday')}
        </Text>
      ) : null}
      {hasReachedMonthlyLimit && !isFrozenToday ? (
        <Text style={styles.statusDanger}>
          {t('streakDisplay.freeze.monthlyLimit', { max: maxFreezesPerMonth })}
        </Text>
      ) : null}
      {freezeSuccess ? (
        <Text style={styles.statusInfo}>
          {t('streakDisplay.freeze.success')}
        </Text>
      ) : null}
      {errorMessage ? <Text style={styles.statusDanger}>{errorMessage}</Text> : null}

      {streakInfo?.recentFreezeDates && streakInfo.recentFreezeDates.length > 0 ? (
        <View style={styles.recentSection}>
          <Text style={styles.recentLabel}>
            {t('streakDisplay.freeze.recentLabel').toUpperCase()}
          </Text>
          <View style={styles.recentRow}>
            {streakInfo.recentFreezeDates.slice(0, 5).map((date) => (
              <View key={date} style={styles.recentChip}>
                <Text style={styles.recentChipText}>
                  {formatLocaleDate(date, locale, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Modal
        visible={infoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('streakDisplay.freeze.howItWorksTitle')}</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              {t('streakDisplay.freeze.howItWorksBody', {
                maxAccumulated: maxStreakFreezesAccumulated,
                maxMonthly: maxFreezesPerMonth,
              })}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// Legacy export retained until removed from other callers
export const StreakFreezeSection = FreezeProgressCard

function createFreezeStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      gap: 16,
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    infoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    infoButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    ringWrap: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringEyebrow: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    ringCountRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 2,
    },
    ringCount: {
      fontSize: 34,
      fontWeight: '800',
      color: colors.textPrimary,
      lineHeight: 36,
    },
    ringCountDen: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 3,
    },
    ringMeta: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 4,
    },
    maxBadge: {
      fontSize: 26,
      fontWeight: '800',
      color: '#93c5fd',
      letterSpacing: 1,
      marginTop: 2,
    },
    heroCopy: {
      flex: 1,
      gap: 10,
    },
    heroTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    heroSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    shieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    shield: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shieldActive: {
      backgroundColor: 'rgba(59,130,246,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.35)',
    },
    shieldInactive: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderMuted,
    },
    shieldCount: {
      marginLeft: 4,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    monthlyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    monthlyBadgeNeutral: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderMuted,
    },
    monthlyBadgeDanger: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderColor: 'rgba(239,68,68,0.25)',
    },
    badgeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    badgeDotNeutral: {
      backgroundColor: colors.textMuted,
    },
    badgeDotDanger: {
      backgroundColor: '#ef4444',
    },
    monthlyText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    monthlyTextNeutral: {
      color: colors.textMuted,
    },
    monthlyTextDanger: {
      color: '#ef4444',
    },
    activeTodayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(59,130,246,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.25)',
    },
    activeTodayText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: '#60a5fa',
    },
    activateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: 'rgba(59,130,246,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.25)',
    },
    activateButtonDisabled: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderMuted,
      opacity: 0.55,
    },
    activateButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#60a5fa',
    },
    activateButtonTextDisabled: {
      color: colors.textMuted,
    },
    activatePill: {
      backgroundColor: 'rgba(59,130,246,0.25)',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    activatePillText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#93c5fd',
    },
    statusSuccess: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '500',
      color: '#22c55e',
    },
    statusInfo: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '500',
      color: '#60a5fa',
    },
    statusDanger: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '500',
      color: '#ef4444',
    },
    recentSection: {
      gap: 8,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    recentLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    recentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    recentChip: {
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    recentChipText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
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
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modalDescription: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
    },
  })
}
