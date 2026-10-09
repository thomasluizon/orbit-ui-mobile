import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { useState, type RefObject } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { format, type Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import {
  buildDayCellAccessibleName,
  CALENDAR_MONTH_GRID_GEOMETRY,
  CALENDAR_GRID_GAP_CONTENT_BREAKPOINT,
  isCalendarDayLoggable,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler'
import type { AppTokensV2 } from '@/lib/theme'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'

export type GridDay = CalendarMonthDay

export interface WeekdayHeader {
  key: string
  label: string
}

interface CalendarGridProps {
  gridDays: GridDay[]
  weekdayHeaders: WeekdayHeader[]
  selectedDay: string | null
  isLoading?: boolean
  monthKey?: string
  monthEntering?: EntryOrExitLayoutType
  swipeGesture?: PanGesture
  gridRef?: RefObject<View | null>
  todayRef?: RefObject<View | null>
  onSelectDay: (dateStr: string) => void
  language: string
  t: (key: string) => string
  tokens: AppTokensV2
  todayKey: string
}

interface CalendarGridDayProps {
  cell: GridDay
  future: boolean
  futureWord: string
  locale: Locale
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
  todayRef?: RefObject<View | null>
  words: DayCellWords
  todayKey: string
}

function CalendarGridDayBody({
  accessibleName,
  cell,
  dayCell,
  onSelectDay,
  selected,
}: Readonly<{
  accessibleName: string
  cell: GridDay
  dayCell: ReadOnlyDayCellProps
  onSelectDay: (dateStr: string) => void
  selected: boolean
}>) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const contents = <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.dayBody}>
    <DayCell {...dayCell} pressed={pressed} focused={focused} />
  </View>
  if (!cell.isCurrentMonth) return contents
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibleName} accessibilityState={{ selected }}
    onPress={() => onSelectDay(cell.dateStr)} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    testID={`calendar-day-select-${cell.dateStr}`} style={styles.dayButton}>{contents}</Pressable>
}

function CalendarGridDay({
  cell,
  future,
  futureWord,
  locale,
  onSelectDay,
  selected,
  selectedWord,
  todayRef,
  words,
  todayKey,
}: Readonly<CalendarGridDayProps>) {
  const writable = cell.isCurrentMonth
    && isCalendarDayLoggable(cell.dateStr, todayKey)
  const today = cell.dateStr === todayKey
  const baseLabel = format(cell.date, 'EEEE, MMM d', { locale })
  const label = selected ? `${baseLabel}, ${selectedWord}` : baseLabel
  const dayCellBase = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today,
    selected,
    raised: writable,
    future: future && cell.isCurrentMonth,
    outsideMonth: !cell.isCurrentMonth,
    label,
    words,
  }
  const dayCell: ReadOnlyDayCellProps = dayCellBase
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${label}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, !writable)

  return (
    <View
      ref={today ? todayRef : undefined}
      collapsable={false}
      testID={`calendar-day-slot-${cell.dateStr}`}
      style={styles.daySlot}
    >
      <CalendarGridDayBody
        accessibleName={accessibleName}
        cell={cell}
        dayCell={dayCell}
        onSelectDay={onSelectDay}
        selected={selected}
      />
    </View>
  )
}

function CalendarGridLoading({ gridDays, gap, label, weekdayLabels }: Readonly<{ gridDays: GridDay[]; gap: 0 | 4; label: string; weekdayLabels: string[] }>) {
  return (
    <View style={styles.loadingGrid}>
      <MonthGrid weekdayLabels={weekdayLabels} gap={gap} loadingLabel={label}>
        {gridDays.map((cell) => (
          <View key={cell.dateStr} style={styles.loadingSlot}>
            <View style={styles.loadingCell}><Skeleton variant="grid" circular rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped /></View>
          </View>
        ))}
      </MonthGrid>
    </View>
  )
}

export function CalendarGrid({
  gridDays,
  weekdayHeaders,
  selectedDay,
  isLoading,
  monthKey,
  monthEntering,
  swipeGesture,
  gridRef,
  todayRef,
  onSelectDay,
  language,
  t,
  todayKey,
}: Readonly<CalendarGridProps>) {
  const { width } = useWindowDimensions()
  const gridGap = width - 2 * CALENDAR_MONTH_GRID_GEOMETRY.inlineInset < CALENDAR_GRID_GAP_CONTENT_BREAKPOINT ? 0 : CALENDAR_MONTH_GRID_GEOMETRY.gap
  const locale = language === 'pt-BR' ? ptBR : enUS
  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  if (isLoading) {
    const loadingGrid = (
      <View ref={gridRef} collapsable={false} testID="calendar-grid" style={styles.calendarGrid}>
        <CalendarGridLoading weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)} gridDays={gridDays} gap={gridGap} label={t('calendar.loading')} />
      </View>
    )
    return swipeGesture
      ? <GestureDetector gesture={swipeGesture}>{loadingGrid}</GestureDetector>
      : loadingGrid
  }

  const grid = (
    <View ref={gridRef} collapsable={false} testID="calendar-grid" style={styles.calendarGrid}>
      <Animated.View
        key={monthKey}
        entering={monthEntering}
        testID="calendar-grid-card"
        style={styles.gridCard}
      >
        <MonthGrid
          weekdayLabels={weekdayHeaders.map((weekday) => weekday.label)}
          gap={gridGap}
        >
          {gridDays.map((cell) => {
            const future = cell.dateStr > todayKey
            const selected = cell.isCurrentMonth && cell.dateStr === selectedDay
            return (
              <CalendarGridDay
                key={cell.dateStr}
                cell={cell}
                future={future}
                futureWord={t('calendar.dayCell.future')}
                locale={locale}
                onSelectDay={onSelectDay}
                selected={selected}
                selectedWord={t('calendar.dayCell.selected')}
                todayRef={todayRef}
                words={words}
                todayKey={todayKey}
              />
            )
          })}
        </MonthGrid>
      </Animated.View>
    </View>
  )

  return swipeGesture ? <GestureDetector gesture={swipeGesture}>{grid}</GestureDetector> : grid
}

const styles = StyleSheet.create({
  calendarGrid: { paddingHorizontal: CALENDAR_MONTH_GRID_GEOMETRY.inlineInset, paddingTop: 0, paddingBottom: 8 },
  gridCard: {
    width: '100%',
    alignSelf: 'center',
  },
  loadingGrid: {
    width: '100%',
    alignSelf: 'center',
  },
  loadingSlot: { width: '100%', minHeight: MONTH_GRID_TARGET_MIN, alignItems: 'center' },
  loadingCell: { width: '100%', maxWidth: MONTH_GRID_TARGET_MIN },
  daySlot: {
    position: 'relative',
    width: '100%',
    minHeight: MONTH_GRID_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBody: { width: '100%', alignItems: 'center' },
  dayButton: { width: '100%', minHeight: MONTH_GRID_TARGET_MIN, backgroundColor: 'transparent' },
})
