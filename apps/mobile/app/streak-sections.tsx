import type { Locale } from 'date-fns'
import {
  View,
  Text,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { formatLocaleDate } from '@orbit/shared/utils'

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
  freezeHeaderRow: StyleProp<ViewStyle>
  freezeIconRow: StyleProp<ViewStyle>
  freezeTitle: StyleProp<TextStyle>
  freezeAvailable: StyleProp<TextStyle>
  frozenTodayBadge: StyleProp<ViewStyle>
  frozenTodayText: StyleProp<TextStyle>
  freezeButton: StyleProp<ViewStyle>
  freezeButtonDisabled: StyleProp<ViewStyle>
  freezeButtonText: StyleProp<TextStyle>
  completedTodayText: StyleProp<TextStyle>
  freezeSuccessText: StyleProp<TextStyle>
  errorText: StyleProp<TextStyle>
  recentFreezes: StyleProp<ViewStyle>
  recentLabel: StyleProp<TextStyle>
  recentDateRow: StyleProp<ViewStyle>
  recentDateChip: StyleProp<ViewStyle>
  recentDateText: StyleProp<TextStyle>
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

interface StreakFreezeSectionProps {
  t: TranslationFn
  locale: string
  dateFnsLocale: Locale
  streak: number
  freezesAvailable: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  canFreeze: boolean
  freezeSuccess: boolean
  errorMessage?: string | null
  streakInfo: StreakInfoView | null
  styles: StreakScreenStyles
  onActivateFreeze: () => void
}

export function StreakFreezeSection({
  t,
  locale,
  dateFnsLocale,
  streak,
  freezesAvailable,
  isFrozenToday,
  hasCompletedToday,
  canFreeze,
  freezeSuccess,
  errorMessage,
  streakInfo,
  styles,
  onActivateFreeze,
}: StreakFreezeSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.freezeHeaderRow}>
        <View style={styles.freezeIconRow}>
          <SvgFreezeIcon strokeColor="#93c5fd" />
          <Text style={styles.freezeTitle}>{t('streakDisplay.freeze.title')}</Text>
        </View>
        <Text style={styles.freezeAvailable} numberOfLines={2}>
          {t('streakDisplay.freeze.available', { count: freezesAvailable })}
        </Text>
      </View>

      {isFrozenToday ? (
        <View style={styles.frozenTodayBadge}>
          <SvgFreezeIcon strokeColor="#60a5fa" />
          <Text style={styles.frozenTodayText}>{t('streakDisplay.freeze.activeToday')}</Text>
        </View>
      ) : streak > 0 ? (
        <TouchableOpacity
          style={[
            styles.freezeButton,
            !canFreeze && styles.freezeButtonDisabled,
          ]}
          disabled={!canFreeze}
          onPress={onActivateFreeze}
          activeOpacity={0.8}
        >
          <Text style={[styles.freezeButtonText, !canFreeze && { color: '#9ca3af' }]}>
            {t('streakDisplay.freeze.activate')}
          </Text>
        </TouchableOpacity>
      ) : null}

      {hasCompletedToday && !isFrozenToday && streak > 0 ? (
        <Text style={styles.completedTodayText}>
          {t('streakDisplay.freeze.completedToday')}
        </Text>
      ) : null}

      {freezeSuccess ? (
        <Text style={styles.freezeSuccessText}>
          {t('streakDisplay.freeze.success')}
        </Text>
      ) : null}

      {errorMessage ? (
        <Text style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}

      {streakInfo?.recentFreezeDates && streakInfo.recentFreezeDates.length > 0 ? (
        <View style={styles.recentFreezes}>
          <Text style={styles.recentLabel}>{t('streakDisplay.freeze.recentLabel').toUpperCase()}</Text>
          <View style={styles.recentDateRow}>
            {streakInfo.recentFreezeDates.slice(0, 5).map((date) => (
              <View key={date} style={styles.recentDateChip}>
                <Text style={styles.recentDateText}>
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
    </View>
  )
}

function SvgFreezeIcon({ strokeColor }: { strokeColor: string }) {
  return (
    <Svg viewBox="0 0 12 14" width={16} height={16}>
      <Path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
