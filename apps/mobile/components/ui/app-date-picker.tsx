import { useState, useMemo, useCallback } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { formatLocaleDate } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2, radius, type AppShadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface AppDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function AppDatePicker({
  value,
  onChange,
  placeholder,
}: Readonly<AppDatePickerProps>) {
  const { t, i18n } = useTranslation()
  const { profile } = useProfile()
  const { currentScheme, currentTheme, shadows } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const weekStartsOn = (profile?.weekStartDay ?? 0) as 0 | 1
  const locale = i18n.language
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(new Date())

  const selectedDate = value ? parseISO(value) : null

  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) {
    setPreviousValue(value)
    if (value) setViewDate(parseISO(value))
  }

  const monthLabel = formatLocaleDate(viewDate, locale, {
    month: 'long',
    year: 'numeric',
  })
  const styles = useMemo(() => createStyles(tokens, shadows), [tokens, shadows])

  const weekDays = useMemo(() => {
    const sundayFirst = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]
    const keys =
      weekStartsOn === 1
        ? [...sundayFirst.slice(1), sundayFirst[0]]
        : sundayFirst
    return keys.map((k) => t(`dates.daysShort.${k}`).charAt(0))
  }, [weekStartsOn, t])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [viewDate, weekStartsOn])

  const calendarWeeks = useMemo(() => {
    const weeks: Date[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) {
      weeks.push(calendarDays.slice(index, index + 7))
    }
    return weeks
  }, [calendarDays])

  const prevMonth = useCallback(() => {
    setViewDate((d) => subMonths(d, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setViewDate((d) => addMonths(d, 1))
  }, [])

  function selectDay(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const displayValue = value ? formatLocaleDate(value, locale) : ''

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel={
          displayValue
            ? t('common.selectedDate', { date: displayValue })
            : t('common.selectDate')
        }
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.triggerText,
            !displayValue && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {displayValue || placeholder || t('common.selectDate')}
        </Text>
        <Calendar size={16} color={tokens.fg3} />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View
            style={styles.dialog}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.monthNav}>
              <TouchableOpacity
                onPress={prevMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('common.previousMonth')}
              >
                <ChevronLeft size={16} color={tokens.fg3} />
              </TouchableOpacity>

              <Text style={styles.monthLabel}>{monthLabel}</Text>

              <TouchableOpacity
                onPress={nextMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={t('common.nextMonth')}
              >
                <ChevronRight size={16} color={tokens.fg3} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {weekDays.map((day, i) => (
                <View key={`wh-${i}`} style={styles.dayCell}>
                  <Text style={styles.weekDayText}>{day}</Text>
                </View>
              ))}
            </View>

            {calendarWeeks.map((week) => (
              <View key={week[0]?.toISOString()} style={styles.weekRow}>
                {week.map((day) => {
                  const isSelected =
                    selectedDate != null && isSameDay(day, selectedDate)
                  const isToday = isSameDay(day, new Date())
                  const isCurrentMonth = isSameMonth(day, viewDate)

                  return (
                    <TouchableOpacity
                      key={day.toISOString()}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isToday && !isSelected && styles.dayCellToday,
                      ]}
                      onPress={() => selectDay(day)}
                      activeOpacity={0.7}
                      accessibilityLabel={formatLocaleDate(day, locale, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !isCurrentMonth && styles.dayTextOutside,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {format(day, 'd')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const DAY_SIZE = 36

function createStyles(tokens: AppTokens, shadows: AppShadows) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: radius.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    triggerText: {
      flex: 1,
      color: tokens.fg1,
      fontSize: 14,
      marginRight: 8,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.50)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: tokens.bgElev,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 10,
      ...shadows.lg,
      elevation: 12,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    monthLabel: {
      color: tokens.fg1,
      fontSize: 13,
      fontWeight: '500',
      textTransform: 'capitalize',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    weekDayText: {
      color: tokens.fg3,
      fontSize: 12,
      fontWeight: '400',
      textAlign: 'center',
    },
    dayCell: {
      width: DAY_SIZE,
      height: DAY_SIZE,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      margin: 1,
    },
    dayCellSelected: {
      backgroundColor: tokens.primary,
    },
    dayCellToday: {
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    dayText: {
      color: tokens.fg1,
      fontSize: 12,
    },
    dayTextOutside: {
      color: tokens.fg3,
    },
    dayTextSelected: {
      color: tokens.fgOnPrimary,
      fontWeight: '600',
    },
  })
}
