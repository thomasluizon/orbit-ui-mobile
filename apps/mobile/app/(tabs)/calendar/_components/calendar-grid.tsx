import type { RefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { format, type Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import {
  buildDayCellAccessibleName,
  isCalendarDayLoggable,
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
  todayKey: string
  interaction?: 'write-window' | 'range-picker'
}

function isInRange(dateStr: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (!rangeStart || !rangeEnd) return false
  const start = rangeStart < rangeEnd ? rangeStart : rangeEnd
  const end = rangeStart < rangeEnd ? rangeEnd : rangeStart
  return dateStr >= start && dateStr <= end
}

interface CalendarGridDayProps {
  cell: GridDay
  future: boolean
  futureWord: string
  inRange: boolean
  isLoading: boolean
  locale: Locale
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
  todayRef?: RefObject<View | null>
  tokens: AppTokensV2
  words: DayCellWords
  interaction: 'write-window' | 'range-picker'
  todayKey: string
}

type CalendarFutureDayProps = {
  accessibleName: string
  cell: GridDay
  tokens: AppTokensV2
}

function CalendarFutureNumeral({ cell, tokens }: Readonly<Pick<CalendarFutureDayProps, 'cell' | 'tokens'>>) {
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`calendar-future-day-${cell.dateStr}`}
      style={[styles.futureNumeral, { color: tokens.fg2 }]}
    >
      {cell.day}
    </Text>
  )
}

function CalendarFutureDay(props: Readonly<CalendarFutureDayProps>) {
  return (
    <View accessibilityRole="image" accessibilityLabel={props.accessibleName} style={styles.futureControl}>
      <CalendarFutureNumeral cell={props.cell} tokens={props.tokens} />
    </View>
  )
}

function calendarDayBackground(
  selected: boolean,
  inRange: boolean,
  raised: boolean,
  tokens: AppTokensV2,
): string {
  if (selected || inRange) return tokens.selectionBg
  return raised ? tokens.bgWell : 'transparent'
}

function CalendarGridDayBody({
  accessibleName,
  cell,
  dayCell,
  future,
  isLoading,
  onSelectDay,
  selected,
  tokens,
}: Readonly<{
  accessibleName: string
  cell: GridDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  isLoading: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  tokens: AppTokensV2
}>) {
  if (isLoading) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="calendar-day-skeleton"
        style={[styles.skeleton, { backgroundColor: tokens.bgWell, opacity: cell.isCurrentMonth ? 1 : 0 }]}
      />
    )
  }
  const contents = future && cell.isCurrentMonth
    ? <CalendarFutureDay accessibleName={accessibleName} cell={cell} tokens={tokens} />
    : <DayCell {...dayCell} accessibilityState={{ selected }} />
  return (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {contents}
      </View>
      {cell.isCurrentMonth ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibleName}
          accessibilityState={{ selected }}
          onPress={() => onSelectDay(cell.dateStr)}
          testID={`calendar-day-select-${cell.dateStr}`}
          style={styles.dayButton}
        />
      ) : null}
    </>
  )
}

function CalendarGridDay({
  cell,
  future,
  futureWord,
  inRange,
  isLoading,
  locale,
  onSelectDay,
  selected,
  selectedWord,
  todayRef,
  tokens,
  words,
  interaction,
  todayKey,
}: Readonly<CalendarGridDayProps>) {
  const writable = interaction === 'write-window'
    && cell.isCurrentMonth
    && isCalendarDayLoggable(cell.dateStr, todayKey)
  const today = cell.dateStr === todayKey
  const baseLabel = format(cell.date, 'EEEE, MMM d', { locale })
  const label = selected ? `${baseLabel}, ${selectedWord}` : baseLabel
  const dayCellBase = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today,
    outsideMonth: !cell.isCurrentMonth,
    label,
    words,
  }
  const dayCell: ReadOnlyDayCellProps = dayCellBase
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${label}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, !writable)
  const raised = writable

  return (
    <View
      ref={today ? todayRef : undefined}
      collapsable={false}
      testID={`calendar-day-slot-${cell.dateStr}`}
      style={[
        styles.daySlot,
        {
          backgroundColor: calendarDayBackground(selected, inRange, raised, tokens),
        },
      ]}
    >
      {selected ? (
        <View
          pointerEvents="none"
          testID={`calendar-day-selection-${cell.dateStr}`}
          style={[styles.selectionRing, { borderColor: tokens.primary }]}
        />
      ) : null}
      <CalendarGridDayBody
        accessibleName={accessibleName}
        cell={cell}
        dayCell={dayCell}
        future={future}
        isLoading={isLoading}
        onSelectDay={onSelectDay}
        selected={selected}
        tokens={tokens}
      />
    </View>
  )
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
  todayKey,
  interaction = 'write-window',
}: Readonly<CalendarGridProps>) {
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
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDay ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            return (
              <CalendarGridDay
                key={cell.dateStr}
                cell={cell}
                future={future}
                futureWord={t('calendar.dayCell.future')}
                inRange={inRange}
                isLoading={isLoading}
                locale={locale}
                onSelectDay={onSelectDay}
                selected={selected}
                selectedWord={t('calendar.dayCell.selected')}
                todayRef={todayRef}
                tokens={tokens}
                words={words}
                interaction={interaction}
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
  calendarGrid: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  gridCard: { borderRadius: 20, padding: 0, borderWidth: 1 },
  daySlot: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionRing: { position: 'absolute', inset: 0, borderRadius: 999, borderWidth: 2 },
  skeleton: { width: 44, height: 44, borderRadius: 999 },
  futureNumeral: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  futureControl: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayButton: { position: 'absolute', inset: 0, borderRadius: 999, backgroundColor: 'transparent' },
})
