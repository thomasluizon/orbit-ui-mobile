import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import { CALENDAR_GRID_GAP_CONTENT_BREAKPOINT, CALENDAR_MONTH_GRID_GEOMETRY, type CalendarRangeModel } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { CalendarStats, type CalendarStat } from './calendar-stats'

interface CalendarRangeNavigationProps {
  rangeLabel: string
  previousRangeLabel: string
  nextRangeLabel: string
  onPreviousRange: () => void
  onNextRange: () => void
  nextRangeDisabled: boolean
  tokens: AppTokensV2
}

export function CalendarRangeNavigation({ rangeLabel, previousRangeLabel, nextRangeLabel, onPreviousRange, onNextRange, nextRangeDisabled, tokens }: Readonly<CalendarRangeNavigationProps>) {
  return (
    <View testID="calendar-range-navigation" style={styles.header}>
      <Text style={[styles.rangeLabel, { color: tokens.fg2 }]}>
        {rangeLabel}
      </Text>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={previousRangeLabel} onPress={onPreviousRange}
          style={({ pressed }) => [styles.iconButton, { borderColor: tokens.hairlineStrong, backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>
          <ChevronLeft size={20} strokeWidth={2} color={tokens.fg2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={nextRangeLabel} onPress={onNextRange} disabled={nextRangeDisabled} accessibilityState={{ disabled: nextRangeDisabled }}
          style={({ pressed }) => [styles.iconButton, { borderColor: tokens.hairlineStrong, backgroundColor: pressed ? tokens.bgHover : 'transparent' }, nextRangeDisabled && { opacity: 0.4 }]}>
          <ChevronRight size={20} strokeWidth={2} color={tokens.fg2} />
        </Pressable>
      </View>
    </View>
  )
}

interface CalendarRangeViewProps {
  model: CalendarRangeModel
  weekdayLabels: readonly string[]
  rangeLabel: string
  isLoading: boolean
  loadingLabel: string
  stats: readonly [CalendarStat, CalendarStat, CalendarStat]
  language: string
  t: TFunction
}

/** A fixed fourteen-day, read-only orientation view with span-level figures. */
export function CalendarRangeView({
  model,
  weekdayLabels,
  rangeLabel,
  isLoading,
  loadingLabel,
  stats,
  language,
  t,
}: Readonly<CalendarRangeViewProps>) {
  const { width } = useWindowDimensions()
  const gridGap = width - 2 * CALENDAR_MONTH_GRID_GEOMETRY.inlineInset < CALENDAR_GRID_GAP_CONTENT_BREAKPOINT ? 0 : CALENDAR_MONTH_GRID_GEOMETRY.gap
  const locale = language === 'pt-BR' ? ptBR : enUS
  const words = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }
  const gridCellCount = model.leadingEmptyDays + model.days.length

  return (
    <View
      accessibilityLabel={rangeLabel}
      accessibilityState={{ busy: isLoading }}
      style={styles.container}
    >
      {isLoading ? (
        <>
          <View style={styles.grid}><MonthGrid weekdayLabels={[...weekdayLabels]} gap={gridGap} label={rangeLabel}>
            {Array.from({ length: gridCellCount }, (_, index) => (
              <View key={index} style={styles.daySlot}>
                <View style={styles.loadingCell}>{index === 0 ? (
                  <Skeleton variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} label={loadingLabel} />
                ) : (
                  <Skeleton variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped />
                )}</View>
              </View>
            ))}
          </MonthGrid></View>
          <CalendarStats stats={stats} state="loading" loadingLabel={loadingLabel} />
        </>
      ) : (
        <>
          <View style={styles.grid}><MonthGrid weekdayLabels={[...weekdayLabels]} gap={gridGap} label={rangeLabel}>
            {Array.from({ length: model.leadingEmptyDays }, (_, index) => (
              <View key={`leading-${index}`} accessibilityElementsHidden style={styles.daySlot} />
            ))}
            {model.days.map((day) => (
              <DayCell
                key={day.dateStr}
                day={day.day}
                done={day.completedCount}
                scheduled={day.totalCount}
                today={day.isToday}
                label={format(day.date, 'EEEE, MMM d', { locale })}
                words={words}
              />
            ))}
          </MonthGrid></View>

          <CalendarStats stats={stats} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  controls: { flexDirection: 'row', flexShrink: 0, gap: 12 },
  grid: { width: '100%', alignSelf: 'center', paddingHorizontal: CALENDAR_MONTH_GRID_GEOMETRY.inlineInset },
  iconButton: { minHeight: 48, minWidth: 48, borderWidth: 1.5, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rangeLabel: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    textAlignVertical: 'center',
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  daySlot: { width: '100%', minHeight: MONTH_GRID_TARGET_MIN, alignItems: 'center' },
  loadingCell: { width: '100%', maxWidth: MONTH_GRID_TARGET_MIN },
})
