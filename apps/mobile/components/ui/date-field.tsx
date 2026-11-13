import { PressScale, PressScalePressable } from '@/components/motion/press-scale'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { PressFill } from '@/components/ui/press-fill'
import { selectedBorderStyle } from '@/components/ui/selected-focus-indicator'
import { SPACING, TOUCH_TARGET_MIN, MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  useWindowDimensions,
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
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

type AppTokens = ReturnType<typeof createTokensV2>

interface DateFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  focusRequest?: number
  appearance?: 'normal' | 'proposed'
  disabled?: boolean
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
      <MotionPressable
        onPress={onPrevMonth}
        accessibilityRole="button"
        accessibilityLabel={t('common.previousMonth')}
        disabled={pickerMode === 'years'}
        style={({ pressed }) => [
          styles.monthNavButton,
          pickerMode === 'years' ? styles.navHidden : null,
          pressed && pickerMode !== 'years' ? { backgroundColor: tokens.bgHover } : null,
        ]}
      >
        <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg3} />
      </MotionPressable>

      <View style={styles.monthLabelGroup}>
        {monthLead ? (
          <Text style={styles.monthLabel}>{monthLead}</Text>
        ) : null}
        <MotionPressable
          onPress={onToggleMode}
          accessibilityRole="button"
          accessibilityLabel={t('common.selectYear')}
          accessibilityState={{ expanded: pickerMode === 'years' }}
          style={({ pressed }) => [styles.yearButton, pressed ? { backgroundColor: tokens.bgHover } : null]}
        >
          <Text
            style={[
              styles.yearLabel,
              pickerMode === 'years' && { color: tokens.fg1 },
            ]}
          >
            {yearLabel}
          </Text>
        </MotionPressable>
      </View>

      <MotionPressable
        onPress={onNextMonth}
        accessibilityRole="button"
        accessibilityLabel={t('common.nextMonth')}
        disabled={pickerMode === 'years'}
        style={({ pressed }) => [
          styles.monthNavButton,
          pickerMode === 'years' ? styles.navHidden : null,
          pressed && pickerMode !== 'years' ? { backgroundColor: tokens.bgHover } : null,
        ]}
      >
        <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg3} />
      </MotionPressable>
    </View>
  )
}

interface DatePickerDayProps {
  day: Date
  isSelected: boolean
  isToday: boolean
  isCurrentMonth: boolean
  locale: string
  onSelectDay: (day: Date) => void
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
}

function DatePickerDay({ day, isSelected, isToday, isCurrentMonth, locale, onSelectDay, tokens, styles }: Readonly<DatePickerDayProps>) {
  return (
    <PressScalePressable
      layerStyle={styles.dayColumn}
      style={({ pressed }) => [
        styles.dayTarget,
        pressed ? { backgroundColor: tokens.bgHover } : null,
      ]}
      onPress={() => onSelectDay(day)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={formatLocaleDate(day, locale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
    >{({ pressed, focused }) =>
      <View
        style={[
          styles.dayCell,
          isSelected && styles.dayCellSelected,
          selectedBorderStyle(isToday && !isSelected, focused, 1, tokens.primary),
        ]}
      >
        <Text
          style={[
            styles.dayText,
            !isCurrentMonth && { color: pressed ? tokens.fg2 : tokens.fg3 },
            isSelected && styles.dayTextSelected,
          ]}
        >
          {format(day, 'd')}
        </Text>
      </View>
    }</PressScalePressable>
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
          <View key={day.key} style={[styles.dayColumn, styles.dayTarget]}>
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
              <DatePickerDay
                key={day.toISOString()}
                day={day}
                isSelected={isSelected}
                isToday={isToday}
                isCurrentMonth={isCurrentMonth}
                locale={locale}
                onSelectDay={onSelectDay}
                tokens={tokens}
                styles={styles}
              />
            )
          })}
        </View>
      ))}
    </>
  )
}

export function DateField({
  value,
  onChange,
  placeholder,
  label,
  focusRequest,
  appearance = 'normal',
  disabled = false,
}: Readonly<DateFieldProps>) {
  const { fontScale } = useWindowDimensions()
  const triggerRef = useRef<View>(null)
  useEffect(() => {
    if (!focusRequest || !triggerRef.current) return
    triggerRef.current.setNativeProps({ hasTVPreferredFocus: true })
    AccessibilityInfo.sendAccessibilityEvent(triggerRef.current, 'focus')
  }, [focusRequest])
  const [triggerPressed, setTriggerPressed] = useState(false)
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
  const [pickerMode, setPickerMode] = useState<'days' | 'years'>('days')
  const [viewDate, setViewDate] = useState(() => (value ? parseISO(value) : new Date()))

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

  const { sheetRef, closeSheet } = useSheetHost()

  const hidePicker = useCallback(() => {
    setIsOpen(false)
  }, [])

  const openPicker = useCallback(() => {
    setPickerMode('days')
    setIsOpen(true)
  }, [])

  function selectDay(day: Date) {
    closeSheet(() => {
      hidePicker()
      onChange(format(day, 'yyyy-MM-dd'))
    })
  }

  const displayValue = value ? formatLocaleDate(value, locale) : ''
  const selectionLabel = displayValue ? t('common.selectedDate', { date: displayValue }) : t('common.selectDate')

  return (
    <>
      <PressScale pressed={triggerPressed} disabled={disabled}><Pressable
        disabled={disabled}
        accessibilityState={{ disabled }}
        ref={triggerRef}
        style={styles.trigger}
        onPress={openPicker}
        onPressIn={() => setTriggerPressed(true)}
        onPressOut={() => setTriggerPressed(false)}
        accessibilityLabel={label ? `${label}, ${selectionLabel}` : selectionLabel}
        accessibilityRole="button"
      >{({ pressed }) => <>
        <PressFill pressed={pressed} color={tokens.bgHoverOpaque} />
        <Text
          style={[
            styles.triggerText,
            !displayValue || appearance === 'proposed' ? { color: pressed ? tokens.fg2 : tokens.fg3 } : null,
          ]}
          numberOfLines={fontScale > 1.3 ? undefined : 1}
        >
          {displayValue || placeholder || t('common.selectDate')}
        </Text>
        <Calendar size={20} strokeWidth={1.8} color={pressed ? tokens.fg2 : tokens.fg3} />
      </>}</Pressable></PressScale>

      {isOpen ? (
        <Sheet ref={sheetRef} open title={t('common.selectDate')} onClose={hidePicker} minimumBodyWidth={7 * DAY_TARGET_SIZE} virtualizedBody={pickerMode === 'years'}>
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
        </Sheet>
      ) : null}
    </>
  )
}

const DAY_SIZE = 36
const DAY_TARGET_SIZE = MONTH_GRID_TARGET_MIN

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    trigger: {
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 56,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.borderControl,
      borderRadius: radius.md,
      paddingVertical: SPACING.s8,
      paddingHorizontal: SPACING.s16,
    },
    triggerText: {
      flex: 1,
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      marginRight: SPACING.s8,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.s8,
      paddingHorizontal: SPACING.s4,
    },
    monthNavButton: {
      overflow: 'hidden',
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    yearButton: {
      overflow: 'hidden',
      minWidth: TOUCH_TARGET_MIN,
      minHeight: TOUCH_TARGET_MIN,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthLabelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    monthLabel: {
      color: tokens.fg1,
      fontFamily: 'Geist_500Medium',
      fontSize: 12,
    },
    yearLabel: {
      color: tokens.fg1,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: SPACING.s4,
      paddingVertical: SPACING.s0,
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
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      textTransform: 'uppercase',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    dayColumn: {
      width: `${100 / 7}%`,
    },
    dayTarget: {
      overflow: 'hidden',
      minHeight: DAY_TARGET_SIZE,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayCell: {
      width: DAY_SIZE,
      height: DAY_SIZE,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayCellSelected: {
      backgroundColor: tokens.primary,
    },
    dayText: {
      color: tokens.fg1,
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
    },
    dayTextSelected: {
      color: tokens.fgOnPrimary,
      fontFamily: 'GeistMono_500Medium',
    },
  })
}
