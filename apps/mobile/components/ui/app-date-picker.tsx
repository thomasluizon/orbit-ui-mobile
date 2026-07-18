import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the dialog transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import {
  addMonths,
  subMonths,
  setYear,
  addDays,
  startOfMonth,
  startOfWeek,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { formatLocaleDate, splitMonthYear } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2, radius, shadowsV2 } from '@/lib/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { YearPicker } from '@/components/ui/year-picker'
import { fieldWellShellStyle } from './field-ring'

type AppTokens = ReturnType<typeof createTokensV2>

interface AppDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

interface DatePickerMonthNavProps {
  pickerMode: 'days' | 'years'
  monthLead: string
  yearLabel: string
  onPrevMonth: () => void
  onNextMonth: () => void
  onToggleMode: () => void
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
}

function DatePickerMonthNav({
  pickerMode,
  monthLead,
  yearLabel,
  onPrevMonth,
  onNextMonth,
  onToggleMode,
  tokens,
  styles,
}: Readonly<DatePickerMonthNavProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.monthNav}>
      <Pressable
        onPress={onPrevMonth}
        hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.previousMonth')}
        disabled={pickerMode === 'years'}
        style={({ pressed }) => [
          pickerMode === 'years' ? styles.navHidden : null,
          pressed ? { opacity: 0.2 } : null,
        ]}
      >
        <ChevronLeft size={18} strokeWidth={1.8} color={tokens.fg3} />
      </Pressable>

      <View style={styles.monthLabelGroup}>
        {monthLead ? (
          <Text style={styles.monthLabel}>{monthLead}</Text>
        ) : null}
        <Pressable
          onPress={onToggleMode}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.selectYear')}
          style={({ pressed }) => (pressed ? { opacity: 0.2 } : undefined)}
        >
          <Text
            style={[
              styles.yearLabel,
              pickerMode === 'years' && { color: tokens.primary },
            ]}
          >
            {yearLabel}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onNextMonth}
        hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.nextMonth')}
        disabled={pickerMode === 'years'}
        style={({ pressed }) => [
          pickerMode === 'years' ? styles.navHidden : null,
          pressed ? { opacity: 0.2 } : null,
        ]}
      >
        <ChevronRight size={18} strokeWidth={1.8} color={tokens.fg3} />
      </Pressable>
    </View>
  )
}

interface DatePickerBodyProps {
  pickerMode: 'days' | 'years'
  viewDate: Date
  weekDays: { key: string; label: string }[]
  calendarWeeks: Date[][]
  selectedDate: Date | null
  locale: string
  onSelectYear: (year: number) => void
  onSelectDay: (day: Date) => void
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
}

function DatePickerBody({
  pickerMode,
  viewDate,
  weekDays,
  calendarWeeks,
  selectedDate,
  locale,
  onSelectYear,
  onSelectDay,
  tokens,
  styles,
}: Readonly<DatePickerBodyProps>) {
  if (pickerMode === 'years') {
    return (
      <YearPicker
        selectedYear={viewDate.getFullYear()}
        onSelectYear={onSelectYear}
        tokens={tokens}
      />
    )
  }

  return (
    <>
      <View style={styles.weekRow}>
        {weekDays.map((day) => (
          <View key={day.key} style={styles.dayCell}>
            <Text style={styles.weekDayText}>{day.label}</Text>
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
              <Pressable
                key={day.toISOString()}
                style={({ pressed }) => [
                  styles.dayCell,
                  isSelected && styles.dayCellSelected,
                  isToday && !isSelected && styles.dayCellToday,
                  pressed ? { opacity: 0.7 } : null,
                ]}
                onPress={() => onSelectDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
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
              </Pressable>
            )
          })}
        </View>
      ))}
    </>
  )
}

export function AppDatePicker({
  value,
  onChange,
  placeholder,
}: Readonly<AppDatePickerProps>) {
  const { t, i18n } = useTranslation()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const weekStartsOn = profile?.weekStartDay ?? 0
  const locale = i18n.language
  const [isOpen, setIsOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pickerMode, setPickerMode] = useState<'days' | 'years'>('days')
  const [viewDate, setViewDate] = useState(new Date())
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useMemo(() => new Animated.Value(0), [])

  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setVisible(true)
  }

  // react-doctor-disable-next-line no-event-handler -- mount/exit-animation orchestration: `visible` keeps the Modal mounted through the exit timing driven by the isOpen transition; not a synthetic event handler https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    if (isOpen) {
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: toAnimatedEasing(dialogMotion.enterEasing),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: toAnimatedEasing(dialogMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false)
      }
    })
  }, [
    dialogMotion.enterDuration,
    dialogMotion.enterEasing,
    dialogMotion.exitDuration,
    dialogMotion.exitEasing,
    isOpen,
    progress,
  ])

  const selectedDate = value ? parseISO(value) : null

  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) {
    setPreviousValue(value)
    if (value) setViewDate(parseISO(value))
  }

  const { lead: monthLead, year: yearLabel } = splitMonthYear(viewDate, locale)
  const styles = useMemo(() => createStyles(tokens), [tokens])

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
        ? [...sundayFirst.slice(1), ...sundayFirst.slice(0, 1)]
        : sundayFirst
    return keys.map((key) => ({
      key,
      label: t(`dates.daysShort.${key}`).charAt(0),
    }))
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is the extracted profile.weekStartDay and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [weekStartsOn, t])

  const calendarDays = useMemo(() => {
    const calStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn })
    return Array.from({ length: 42 }, (_, index) => addDays(calStart, index))
    // react-doctor-disable-next-line exhaustive-deps -- weekStartsOn is the extracted profile.weekStartDay and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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

  const selectYear = useCallback((year: number) => {
    setViewDate((d) => setYear(d, year))
    setPickerMode('days')
  }, [])

  const closePicker = useCallback(() => {
    setIsOpen(false)
  }, [])

  const openPicker = useCallback(() => {
    setPickerMode('days')
    setIsOpen(true)
  }, [])

  function selectDay(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    closePicker()
  }

  const displayValue = value ? formatLocaleDate(value, locale) : ''

  const dialogTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.shift, 0],
  })
  const dialogScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.scaleFrom, dialogMotion.scaleTo],
  })

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          pressed ? { opacity: 0.7 } : null,
        ]}
        onPress={openPicker}
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
        <Calendar size={20} strokeWidth={1.8} color={tokens.fg4} />
      </Pressable>

      {visible ? (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={closePicker}
        >
        <Pressable
          style={styles.root}
          onPress={closePicker}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, { opacity: progress }]}
          />
          <Animated.View
            style={[
              styles.dialog,
              {
                opacity: progress,
                transform: [{ translateY: dialogTranslateY }, { scale: dialogScale }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <DatePickerMonthNav
              pickerMode={pickerMode}
              monthLead={monthLead}
              yearLabel={yearLabel}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
              onToggleMode={() =>
                setPickerMode((mode) => (mode === 'years' ? 'days' : 'years'))
              }
              tokens={tokens}
              styles={styles}
            />

            <DatePickerBody
              pickerMode={pickerMode}
              viewDate={viewDate}
              weekDays={weekDays}
              calendarWeeks={calendarWeeks}
              selectedDate={selectedDate}
              locale={locale}
              onSelectYear={selectYear}
              onSelectDay={selectDay}
              tokens={tokens}
              styles={styles}
            />
          </Animated.View>
        </Pressable>
        </Modal>
      ) : null}
    </>
  )
}

const DAY_SIZE = 36

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    trigger: {
      ...fieldWellShellStyle(tokens),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    triggerText: {
      flex: 1,
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      marginRight: 8,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: tokens.scrim,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: tokens.bgSheet,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 12,
      ...shadowsV2.shadow2,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    monthLabelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    monthLabel: {
      color: tokens.fg1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    yearLabel: {
      color: tokens.fg1,
      fontFamily: 'Roboto_500Medium',
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    navHidden: {
      opacity: 0,
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    weekDayText: {
      color: tokens.fg3,
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      textTransform: 'uppercase',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    dayCell: {
      width: DAY_SIZE,
      height: DAY_SIZE,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      margin: 1,
    },
    dayCellSelected: {
      backgroundColor: tokens.primary,
    },
    dayCellToday: {
      borderWidth: 1,
      borderColor: tokens.primary,
    },
    dayText: {
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
    },
    dayTextOutside: {
      color: tokens.fg3,
    },
    dayTextSelected: {
      color: tokens.fgOnPrimary,
      fontFamily: 'Rubik_500Medium',
    },
  })
}
