import { StyleSheet, Text, View } from 'react-native'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import type { CalendarRangeModel } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { CalendarStats, type CalendarStat } from './calendar-stats'

interface CalendarRangeViewProps {
  model: CalendarRangeModel
  weekdayLabels: readonly string[]
  rangeLabel: string
  previousRangeLabel: string
  nextRangeLabel: string
  onPreviousRange: () => void
  onNextRange: () => void
  nextRangeDisabled: boolean
  isLoading: boolean
  loadingLabel: string
  stats: readonly [CalendarStat, CalendarStat, CalendarStat]
  language: string
  t: TFunction
  tokens: AppTokensV2
}

/** A fixed fourteen-day, read-only orientation view with span-level figures. */
export function CalendarRangeView({
  model,
  weekdayLabels,
  rangeLabel,
  previousRangeLabel,
  nextRangeLabel,
  onPreviousRange,
  onNextRange,
  nextRangeDisabled,
  isLoading,
  loadingLabel,
  stats,
  language,
  t,
  tokens,
}: Readonly<CalendarRangeViewProps>) {
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
      <View style={styles.header}>
        <Text numberOfLines={1} style={[styles.rangeLabel, { color: tokens.fg2 }]}>
          {rangeLabel}
        </Text>
        <PillButton
          variant="ghost"
          size="sm"
          iconOnly
          label={previousRangeLabel}
          onClick={onPreviousRange}
        >
          <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg2} />
        </PillButton>
        <PillButton
          variant="ghost"
          size="sm"
          iconOnly
          label={nextRangeLabel}
          onClick={onNextRange}
          disabled={nextRangeDisabled}
        >
          <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg2} />
        </PillButton>
      </View>
      {isLoading ? (
        <>
          <MonthGrid weekdayLabels={[...weekdayLabels]} gap={4} label={rangeLabel}>
            {Array.from({ length: gridCellCount }, (_, index) => (
              <View key={index} style={styles.daySlot}>
                {index === 0 ? (
                  <Skeleton variant="grid" rows={1} cols={1} cell={44} gap={0} label={loadingLabel} />
                ) : (
                  <Skeleton variant="grid" rows={1} cols={1} cell={44} gap={0} grouped />
                )}
              </View>
            ))}
          </MonthGrid>
          <CalendarStats stats={stats} state="loading" loadingLabel={loadingLabel} />
        </>
      ) : (
        <>
          <MonthGrid weekdayLabels={[...weekdayLabels]} gap={4} label={rangeLabel}>
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
          </MonthGrid>

          <CalendarStats stats={stats} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingHorizontal: 4, paddingTop: 12, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  daySlot: { width: 44, height: 44 },
})
