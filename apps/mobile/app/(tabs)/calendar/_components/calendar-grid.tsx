import type { RefObject } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { DayCellWords, DayOutcome, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import {
  buildDayCellAccessibleName,
  formatAPIDate,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
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
  t: (key: string) => string
  tokens: AppTokensV2
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
    <View ref={gridRef} collapsable={false} testID="calendar-grid" style={styles.calendarGrid}>
      <Animated.View
        key={monthKey}
        entering={monthEntering}
        testID="calendar-grid-card"
        style={[styles.gridCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
      >
        <MonthGrid weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)} gap={0}>
          {gridDays.map((cell) => {
            const future = cell.dateStr > todayKey
            const outcome: DayOutcome | undefined = future ? 'future' : undefined
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDay ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            const dayCell: ReadOnlyDayCellProps = {
              day: cell.day,
              done: cell.completedCount,
              scheduled: cell.totalCount,
              today: cell.isToday,
              selected,
              outsideMonth: !cell.isCurrentMonth,
              outcome,
              label: format(cell.date, 'EEEE, MMM d', { locale }),
              words,
            }
            const resolvedOutcome = resolveDayCellOutcome(dayCell)
            return (
              <View
                key={cell.dateStr}
                ref={cell.isToday ? todayRef : undefined}
                collapsable={false}
                style={[styles.daySlot, { backgroundColor: inRange ? tokens.selectionBg : 'transparent' }]}
              >
                {isLoading ? (
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    testID="calendar-day-skeleton"
                    style={[styles.skeleton, { backgroundColor: tokens.bgWell, opacity: cell.isCurrentMonth ? 1 : 0 }]}
                  />
                ) : (
                  <>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <DayCell {...dayCell} />
                    </View>
                    {cell.isCurrentMonth ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={buildDayCellAccessibleName(dayCell, resolvedOutcome, false)}
                        accessibilityState={{ selected }}
                        onPress={() => onSelectDay(cell.dateStr)}
                        testID={`calendar-day-button-${cell.dateStr}`}
                        style={styles.dayButton}
                      />
                    ) : null}
                  </>
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
  calendarGrid: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  gridCard: { borderRadius: 20, padding: 0, borderWidth: 1 },
  daySlot: { position: 'relative', width: 44, height: 44, borderRadius: 999 },
  dayButton: { position: 'absolute', inset: 0, borderRadius: 999, backgroundColor: 'transparent' },
  skeleton: { width: 44, height: 44, borderRadius: 999 },
})
