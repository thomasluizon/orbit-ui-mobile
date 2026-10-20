import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import { CALENDAR_GRID_GAP_CONTENT_BREAKPOINT, CALENDAR_MONTH_GRID_GEOMETRY, type CalendarRangeModel } from '@orbit/shared/utils'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarStats, type CalendarStat } from './calendar-stats'

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
                  <Skeleton variant="grid" circular rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} label={loadingLabel} />
                ) : (
                  <Skeleton variant="grid" circular rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped />
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
  grid: { width: '100%', alignSelf: 'center', paddingHorizontal: CALENDAR_MONTH_GRID_GEOMETRY.inlineInset },
  daySlot: { width: '100%', minHeight: MONTH_GRID_TARGET_MIN, alignItems: 'center' },
  loadingCell: { width: '100%', maxWidth: MONTH_GRID_TARGET_MIN },
})
