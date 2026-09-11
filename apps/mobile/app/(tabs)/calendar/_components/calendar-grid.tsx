import type { RefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { format, type Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
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
}

function CalendarDayVisual({ cell, dayCell, future, tokens }: Readonly<{
  cell: GridDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  tokens: AppTokensV2
}>) {
  if (!future || !cell.isCurrentMonth) return <DayCell {...dayCell} />
  return (
    <Text testID={`calendar-future-day-${cell.dateStr}`} style={[styles.futureNumeral, { color: tokens.fg4 }]}>
      {cell.day}
    </Text>
  )
}

function CalendarDayButton({
  accessibleName,
  cell,
  onSelectDay,
  selected,
  selectedWord,
}: Readonly<{
  accessibleName: string
  cell: GridDay
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
}>) {
  if (!cell.isCurrentMonth) return null
  const label = selected ? `${accessibleName}, ${selectedWord}` : accessibleName
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => onSelectDay(cell.dateStr)}
      testID={`calendar-day-button-${cell.dateStr}`}
      style={styles.dayButton}
    />
  )
}

function CalendarDayContent({
  accessibleName,
  cell,
  dayCell,
  future,
  onSelectDay,
  selected,
  selectedWord,
  tokens,
}: Readonly<{
  accessibleName: string
  cell: GridDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  selectedWord: string
  tokens: AppTokensV2
}>) {
  return (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CalendarDayVisual cell={cell} dayCell={dayCell} future={future} tokens={tokens} />
      </View>
      <CalendarDayButton
        accessibleName={accessibleName}
        cell={cell}
        onSelectDay={onSelectDay}
        selected={selected}
        selectedWord={selectedWord}
      />
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
}: Readonly<CalendarGridDayProps>) {
  const dayCell: ReadOnlyDayCellProps = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today: cell.isToday,
    outsideMonth: !cell.isCurrentMonth,
    label: format(cell.date, 'EEEE, MMM d', { locale }),
    words,
  }
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${dayCell.label}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, false)

  return (
    <View
      ref={cell.isToday ? todayRef : undefined}
      collapsable={false}
      testID={`calendar-day-slot-${cell.dateStr}`}
      style={[
        styles.daySlot,
        {
          backgroundColor: selected ? tokens.primaryDim : inRange ? tokens.selectionBg : 'transparent',
          borderColor: selected ? tokens.primary : 'transparent',
          borderWidth: selected ? 2 : 0,
        },
      ]}
    >
      {isLoading ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="calendar-day-skeleton"
          style={[styles.skeleton, { backgroundColor: tokens.bgWell, opacity: cell.isCurrentMonth ? 1 : 0 }]}
        />
      ) : (
        <CalendarDayContent
          accessibleName={accessibleName}
          cell={cell}
          dayCell={dayCell}
          future={future}
          onSelectDay={onSelectDay}
          selected={selected}
          selectedWord={selectedWord}
          tokens={tokens}
        />
      )}
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
}: Readonly<CalendarGridProps>) {
  const todayKey = formatAPIDate(new Date())
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
  daySlot: { position: 'relative', width: 44, height: 44, borderRadius: 999 },
  dayButton: { position: 'absolute', inset: 0, borderRadius: 999, backgroundColor: 'transparent' },
  skeleton: { width: 44, height: 44, borderRadius: 999 },
  futureNumeral: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
})
