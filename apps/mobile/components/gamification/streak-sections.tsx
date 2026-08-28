import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { getStreakTierLabelKey } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { StatTile } from '@/components/ui/stat-tile'
import { DayStrip } from '@/components/dates/day-strip'
import {
  styles,
  useTokens,
  type StreakDayView,
  type Tokens,
  type TranslationFn,
} from '@/components/gamification/streak-sections-styles'

export { FreezeProgressCard } from './streak-sections-freeze'
export type { StreakDayView } from '@/components/gamification/streak-sections-styles'

interface StreakStatsRowProps {
  t: TranslationFn
  streak: number
  longestStreak: number
}

/** Kit StatTile row for the streak detail: current, longest, and tier. */
export function StreakStatsRow({
  t,
  streak,
  longestStreak,
}: Readonly<StreakStatsRowProps>) {
  return (
    <View>
      <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
      <View style={styles.statsRow}>
        <StatTile

          value={streak}
          label={t('streakDisplay.detail.currentStreak')}
        />
        <StatTile

          value={longestStreak}
          label={t('streakDisplay.detail.longestStreak')}
        />
        <StatTile

          value={t(getStreakTierLabelKey(streak))}
          label={t('streakDisplay.detail.tierTileLabel')}

        />
      </View>
    </View>
  )
}

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
}

/** Week strip in the streak-calendar language: weekday header, amber run band,
 *  cyan freeze teardrops, primary today ring, and the status legend. */
export function StreakTimelineCard({
  t,
  weekDays,
}: Readonly<StreakTimelineCardProps>) {
  const tokens = useTokens()

  return (
    <View>
      <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
      <View style={styles.groupWrap}>
        <View
          style={[
            styles.weekCard,
            { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
          ]}
        >
          <DayStrip
            scope="account"
            days={weekDays.map((day) => day.status)}
            labels={weekDays.map((day) => `${day.dayLabel} ${day.dayNum}`)}
            words={{
              active: t('streakDisplay.detail.dayActive'),
              frozen: t('streakDisplay.detail.dayFrozen'),
              missed: t('streakDisplay.detail.dayMissed'),
              today: t('calendar.legend.today'),
            }}
            label={t('streakDisplay.detail.thisWeek')}
            size={24}
          />
          <View style={styles.legendRow}>
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayActive')}
              swatch={
                <View
                  style={[styles.legendDot, { backgroundColor: tokens.statusOverdue }]}
                />
              }
            />
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayFrozen')}
              swatch={
                <View
                  style={[styles.legendDot, { backgroundColor: tokens.statusFrozen }]}
                />
              }
            />
            <LegendItem
              tokens={tokens}
              label={t('streakDisplay.detail.dayMissed')}
              swatch={
                <View
                  style={[styles.legendDotHollow, { borderColor: tokens.statusEmpty }]}
                />
              }
            />
          </View>
        </View>
      </View>
    </View>
  )
}

function LegendItem({
  tokens,
  label,
  swatch,
}: Readonly<{ tokens: Tokens; label: string; swatch: ReactNode }>) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={[styles.legendLabel, { color: tokens.fg3 }]}>{label}</Text>
    </View>
  )
}
