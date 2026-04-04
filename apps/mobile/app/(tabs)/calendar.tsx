import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from 'date-fns'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useCalendarData } from '@/hooks/use-habits'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surfaceGround: '#0d0b16',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  textFaded: '#a59cba',
  green: '#22c55e',
  orange: '#f97316',
}

// ---------------------------------------------------------------------------
// Day cell status color
// ---------------------------------------------------------------------------

function dayDotColor(entries: CalendarDayEntry[]): string | null {
  if (entries.length === 0) return null
  const hasCompleted = entries.some((e) => e.status === 'completed')
  const hasMissed = entries.some((e) => e.status === 'missed')
  const hasUpcoming = entries.some((e) => e.status === 'upcoming')

  if (hasCompleted && !hasMissed) return colors.green
  if (hasMissed) return colors.orange
  if (hasUpcoming) return colors.primary
  return colors.textMuted
}

// ---------------------------------------------------------------------------
// Calendar Screen
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showDayDetail, setShowDayDetail] = useState(false)

  const { dayMap, isLoading, isFetching } = useCalendarData(currentMonth)

  const monthLabel = useMemo(
    () => format(currentMonth, 'MMMM yyyy'),
    [currentMonth],
  )

  const prevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()))
  }, [])

  const onSelectDay = useCallback((dateStr: string) => {
    setSelectedDay(dateStr)
    setShowDayDetail(true)
  }, [])

  // Build calendar grid
  const calendarWeeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const weeks: Date[][] = []
    let day = calStart
    let week: Date[] = []

    while (day <= calEnd) {
      week.push(day)
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
      day = addDays(day, 1)
    }

    return weeks
  }, [currentMonth])

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  // Selected day entries
  const selectedEntries = useMemo(() => {
    if (!selectedDay) return []
    return dayMap.get(selectedDay) ?? []
  }, [selectedDay, dayMap])

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Calendar</Text>
        </View>

        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={prevMonth}
            activeOpacity={0.7}
          >
            <ChevronLeft size={14} color={colors.textFaded} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={nextMonth}
            activeOpacity={0.7}
          >
            <ChevronRight size={14} color={colors.textFaded} />
          </TouchableOpacity>
        </View>

        {/* Loading state */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* Calendar grid */}
        {!isLoading && (
          <View style={styles.calendarCard}>
            {/* Weekday headers */}
            <View style={styles.weekDayRow}>
              {weekDays.map((d, i) => (
                <View key={i} style={styles.weekDayCell}>
                  <Text style={styles.weekDayText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Day cells */}
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  const dateStr = formatAPIDate(day)
                  const isCurrentMonth = isSameMonth(day, currentMonth)
                  const isCurrentDay = isToday(day)
                  const entries = dayMap.get(dateStr) ?? []
                  const dotColor = dayDotColor(entries)

                  return (
                    <TouchableOpacity
                      key={di}
                      style={[
                        styles.dayCell,
                        isCurrentDay && styles.dayCellToday,
                      ]}
                      onPress={() => onSelectDay(dateStr)}
                      activeOpacity={0.6}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !isCurrentMonth && styles.dayTextOutside,
                          isCurrentDay && styles.dayTextToday,
                        ]}
                      >
                        {format(day, 'd')}
                      </Text>
                      {dotColor && (
                        <View
                          style={[styles.dayDot, { backgroundColor: dotColor }]}
                        />
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.green }]} />
            <Text style={styles.legendText}>Done</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Upcoming</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.orange }]} />
            <Text style={styles.legendText}>Missed</Text>
          </View>
        </View>
      </ScrollView>

      {/* Day detail bottom sheet */}
      <BottomSheetModal
        open={showDayDetail}
        onClose={() => setShowDayDetail(false)}
        title={selectedDay ? format(new Date(selectedDay + 'T12:00:00'), 'EEEE, MMM d') : ''}
        snapPoints={['40%', '70%']}
      >
        {selectedEntries.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>No habits scheduled for this day</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {selectedEntries.map((entry, idx) => (
              <View key={`${entry.habitId}-${idx}`} style={styles.dayEntryRow}>
                <View
                  style={[
                    styles.dayEntryDot,
                    {
                      backgroundColor:
                        entry.status === 'completed'
                          ? colors.green
                          : entry.status === 'missed'
                            ? colors.orange
                            : colors.primary,
                    },
                  ]}
                />
                <View style={styles.dayEntryContent}>
                  <Text style={styles.dayEntryTitle}>{entry.title}</Text>
                  {entry.dueTime && (
                    <Text style={styles.dayEntryTime}>{entry.dueTime}</Text>
                  )}
                </View>
                <Text style={styles.dayEntryStatus}>
                  {entry.status === 'completed'
                    ? 'Done'
                    : entry.status === 'missed'
                      ? 'Missed'
                      : 'Upcoming'}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </BottomSheetModal>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginTop: 16,
  },
  monthNavButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 12,
  },
  weekDayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
    borderRadius: 12,
  },
  dayCellToday: {
    backgroundColor: `${colors.primary}20`,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  dayTextOutside: {
    color: colors.textMuted,
    opacity: 0.4,
  },
  dayTextToday: {
    color: colors.primary,
    fontWeight: '700',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyDay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyDayText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  dayEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  dayEntryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dayEntryContent: {
    flex: 1,
  },
  dayEntryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dayEntryTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dayEntryStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
})
