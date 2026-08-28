import type { RefObject } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { TFunction } from 'i18next'
import type { DayCellWords, DayOutcome } from '@orbit/shared/contracts/dates'
import { formatAPIDate, type CalendarMonthDay } from '@orbit/shared/utils'
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler'
import type { AppTokensV2 } from '@/lib/theme'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'

export type GridDay = CalendarMonthDay

export interface WeekdayHeader {
  key: string
  label: string
}

interface CalendarGridProps {
  gridDays: GridDay[]
  weekdayHeaders: WeekdayHeader[]
  selectedDay: string | null
  isLoading: boolean
  rangeStart?: string | null
  rangeEnd?: string | null
  monthKey?: string
  monthEntering?: EntryOrExitLayoutType
  swipeGesture?: PanGesture
  gridRef?: RefObject<View | null>
  todayRef?: RefObject<View | null>
  onSelectDay: (dateStr: string) => void
  language: string
  t: TFunction
  tokens: AppTokensV2
}

function earliestLoggableDate(): string {
  const earliest = new Date()
  earliest.setDate(earliest.getDate() - 6)
  return formatAPIDate(earliest)
}

function isInRange(dateStr: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (!rangeStart || !rangeEnd) return false
  const start = rangeStart < rangeEnd ? rangeStart : rangeEnd
  const end = rangeStart < rangeEnd ? rangeEnd : rangeStart
  return dateStr >= start && dateStr <= end
}

export function CalendarGrid({
  gridDays,
  weekdayHeaders,
  selectedDay,
  isLoading,
  rangeStart = null,
  rangeEnd = null,
  monthKey,
  monthEntering,
  swipeGesture,
  gridRef,
  todayRef,
  onSelectDay,
  language,
  t,
  tokens,
}: Readonly<CalendarGridProps>) {
  const todayKey = formatAPIDate(new Date())
  const earliestKey = earliestLoggableDate()
  const locale = language === 'pt-BR' ? ptBR : enUS
  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    future: t('calendar.dayCell.future'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    selected: t('calendar.dayCell.selected'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  const grid = (
    <View ref={gridRef} collapsable={false} style={styles.calendarGrid}>
      <Animated.View
        key={monthKey}
        entering={monthEntering}
        style={[styles.gridCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
      >
        <MonthGrid weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)}>
          {gridDays.map((cell) => {
            const future = cell.dateStr > todayKey
            const loggable = cell.isCurrentMonth && !future && cell.dateStr >= earliestKey
            const outcome: DayOutcome | undefined = future ? 'future' : undefined
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDay ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            const dayCell = {
              day: cell.day,
              done: isLoading ? undefined : cell.completedCount,
              scheduled: isLoading ? undefined : cell.totalCount,
              today: cell.isToday,
              selected,
              outsideMonth: !cell.isCurrentMonth,
              label: format(cell.date, 'EEEE, MMM d', { locale }),
              words,
            }
            return (
              <View
                key={cell.dateStr}
                ref={cell.isToday ? todayRef : undefined}
                collapsable={false}
                style={{ borderRadius: 999, backgroundColor: inRange ? tokens.selectionBg : 'transparent' }}
              >
                {loggable ? (
                  <DayCell {...dayCell} loggable onPress={() => onSelectDay(cell.dateStr)} />
                ) : (
                  <DayCell {...dayCell} outcome={outcome} />
                )}
              </View>
            )
          })}
        </MonthGrid>
      </Animated.View>
    </View>
  )

  return swipeGesture ? <GestureDetector gesture={swipeGesture}>{grid}</GestureDetector> : grid
}

const styles = StyleSheet.create({
  calendarGrid: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  gridCard: { borderRadius: 20, padding: 16, borderWidth: 1 },
})
