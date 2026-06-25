import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Snowflake } from 'lucide-react-native'
import { getStreakTierLabelKey } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { StatTile } from '@/components/ui/stat-tile'
import {
  isInRun,
  rgbaFromHex,
  styles,
  useTokens,
  type StreakDayView,
  type Tokens,
  type TranslationFn,
} from './streak-sections-styles'

export { FreezeProgressCard } from './streak-sections-freeze'
export type { StreakDayView } from './streak-sections-styles'

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
          emoji="🔥"
          value={streak}
          label={t('streakDisplay.detail.currentStreak')}
        />
        <StatTile
          emoji="🏆"
          value={longestStreak}
          label={t('streakDisplay.detail.longestStreak')}
        />
        <StatTile
          emoji="🎖️"
          value={t(getStreakTierLabelKey(streak))}
          label={t('streakDisplay.detail.tierTileLabel')}
          phraseValue
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
          <View style={styles.weekHeaderRow}>
            {weekDays.map((day) => (
              <Text
                key={day.dateStr}
                style={[styles.weekHeaderLabel, { color: tokens.fg3 }]}
              >
                {day.dayLabel.toUpperCase()}
              </Text>
            ))}
          </View>
          <View style={styles.weekCellsRow}>
            {weekDays.map((day, index) => (
              <StreakDayCell
                key={day.dateStr}
                day={day}
                tokens={tokens}
                runStart={isInRun(day.status) && (index === 0 || !isInRun(weekDays[index - 1]!.status))}
                runEnd={isInRun(day.status) && (index === weekDays.length - 1 || !isInRun(weekDays[index + 1]!.status))}
              />
            ))}
          </View>
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

interface StreakDayCellProps {
  day: StreakDayView
  tokens: Tokens
  runStart: boolean
  runEnd: boolean
}

function StreakDayCell({
  day,
  tokens,
  runStart,
  runEnd,
}: Readonly<StreakDayCellProps>) {
  const inRun = isInRun(day.status)

  let numeralColor = tokens.fg3
  if (day.status === 'active' || day.status === 'frozen' || day.status === 'today') {
    numeralColor = tokens.fg1
  }

  return (
    <View style={styles.dayCell}>
      {inRun ? (
        <View
          style={[
            styles.runBand,
            {
              backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.16),
              left: runStart ? 5 : 0,
              right: runEnd ? 5 : 0,
              borderTopLeftRadius: runStart ? 999 : 0,
              borderBottomLeftRadius: runStart ? 999 : 0,
              borderTopRightRadius: runEnd ? 999 : 0,
              borderBottomRightRadius: runEnd ? 999 : 0,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.dayDisc,
          day.status === 'today'
            ? { borderWidth: 1.5, borderColor: tokens.primary }
            : null,
        ]}
      >
        <Text
          style={[
            day.status === 'today' ? styles.dayNumeralToday : styles.dayNumeral,
            { color: numeralColor },
          ]}
        >
          {day.dayNum}
        </Text>
      </View>
      {day.status === 'frozen' ? (
        <View
          style={[styles.freezeDrop, { backgroundColor: tokens.statusFrozen }]}
        >
          <View style={styles.freezeDropIcon}>
            <Snowflake size={10} strokeWidth={2.2} color={tokens.bg} />
          </View>
        </View>
      ) : null}
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
