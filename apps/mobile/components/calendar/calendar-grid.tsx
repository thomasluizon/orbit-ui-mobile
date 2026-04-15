import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { useEffect, useRef } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  getDate,
} from 'date-fns'
import { useTranslation } from 'react-i18next'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

/**
 * Mobile parity port of `apps/web/components/calendar/calendar-grid.tsx`.
 *
 * Renders the month grid with status-coloured day cells and a perfect-day
 * dot. Behaviour and dayStatus rules mirror the web implementation
 * exactly; web is the source of truth per the parity directive.
 *
 * The existing mobile calendar screen at `apps/mobile/app/(tabs)/calendar.tsx`
 * still inlines an equivalent grid for now; this file gives consumers
 * a parity-aligned import (`@/components/calendar/calendar-grid`) that
 * matches the web component path 1:1.
 */
type AppColors = ReturnType<typeof useAppTheme>['colors']

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
}

interface GridDay {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  entries: CalendarDayEntry[]
  completedCount: number
  totalCount: number
  completionRatio: number
}

type DayStatus = 'empty' | 'done' | 'missed' | 'upcoming'

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return 'empty'
  if (cell.completedCount === cell.totalCount) return 'done'
  const hasMissed = cell.entries.some((e) => e.status === 'missed')
  if (hasMissed) return 'missed'
  return 'upcoming'
}

function getDayBgColor(cell: GridDay, colors: AppColors): string {
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return cell.completionRatio >= 0.9 ? colors.green500bg : colors.green500_60
    case 'missed':
      return colors.orange500_30
    case 'upcoming':
      return colors.primary_20
    default:
      return cell.isCurrentMonth ? colors.surfaceGround : 'transparent'
  }
}

function getDayTextColor(cell: GridDay, colors: AppColors): string {
  if (!cell.isCurrentMonth) return colors.textFaded40
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return '#ffffff'
    case 'missed':
      return colors.orange300
    case 'upcoming':
      return colors.textPrimary
    default:
      return colors.textFaded
  }
}

function getDotColor(cell: GridDay, colors: AppColors): string | null {
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return colors.green400
    case 'missed':
      return colors.orange400
    case 'upcoming':
      return colors.primary400
    default:
      return null
  }
}

/**
 * Pulsing perfect-day dot. Uses native driver for opacity/scale so the
 * animation runs off the JS thread (60fps even under load).
 */
function PerfectDayDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.72)).current
  const scale = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.72, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.9, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [opacity, scale])

  return (
    <Animated.View
      style={[
        { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
        { backgroundColor: color, opacity, transform: [{ scale }] },
      ]}
    />
  )
}

export function CalendarGrid({ currentMonth, dayMap, onSelectDay }: Readonly<CalendarGridProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = (profile?.weekStartDay as 0 | 1) ?? 1

  const weekdayHeaders = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    if (weekStartsOn === 0) {
      return [t('dates.daysShort.sunday'), ...mondayFirst.slice(0, 6)]
    }
    return mondayFirst
  }, [weekStartsOn, t])

  const gridDays = useMemo<GridDay[]>(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })

    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
      const dateStr = formatAPIDate(date)
      const entries = dayMap.get(dateStr) ?? []
      const completedCount = entries.filter((e) => e.status === 'completed').length
      const totalCount = entries.length

      return {
        date,
        dateStr,
        day: getDate(date),
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isToday(date),
        entries,
        completedCount,
        totalCount,
        completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
      }
    })
  }, [currentMonth, dayMap, weekStartsOn])

  return (
    <View>
      <View style={styles.weekdayRow}>
        {weekdayHeaders.map((day) => (
          <Text key={day} style={[styles.weekdayLabel, { color: colors.textFaded }]}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {gridDays.map((cell) => {
          const canSelect = cell.isCurrentMonth
          const dotColor = getDotColor(cell, colors)
          const status = dayStatus(cell)

          return (
            <Pressable
              key={cell.dateStr}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSelect }}
              onPress={() => canSelect && onSelectDay(cell.dateStr)}
              style={({ pressed }) => [
                styles.dayCell,
                {
                  backgroundColor: getDayBgColor(cell, colors),
                  opacity: pressed && canSelect ? 0.85 : 1,
                  borderWidth: cell.isToday ? 2 : 0,
                  borderColor: cell.isToday ? colors.primary : 'transparent',
                },
              ]}
            >
              <Text style={[styles.dayText, { color: getDayTextColor(cell, colors) }]}>
                {cell.day}
              </Text>
              {cell.isCurrentMonth && cell.totalCount > 0 && dotColor ? (
                status === 'done' ? (
                  <PerfectDayDot color={dotColor} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                )
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    padding: 4,
  },
  dayText: {
    fontSize: 14,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
})
