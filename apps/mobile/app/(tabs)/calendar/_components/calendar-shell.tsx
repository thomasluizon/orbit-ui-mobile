import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import { ChevronDown, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { formatCalendarMonthHeading, formatLocaleDate } from '@orbit/shared/utils'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarHeaderProps {
  currentMonth: Date
  todayKey: string
  previousMonthLabel: string
  nextMonthLabel: string
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  onSelectMonth: (month: number, year: number) => void
  period?: {
    view: 'week' | 'range' | 'agenda'
    label: string
    previousLabel: string
    nextLabel: string
    onPrevious: () => void
    onNext: () => void
    onCurrent: () => void
    nextDisabled?: boolean
  }
  viewSelector?: ReactNode
  tokens: Tokens
}

function CalendarMonthPicker({ currentMonth, tokens, onSelectMonth, choosingYear, year, onSelectYear }: Readonly<Pick<CalendarHeaderProps, 'currentMonth' | 'tokens' | 'onSelectMonth'> & { choosingYear: boolean; year: number; onSelectYear: (year: number) => void }>) {
  const { i18n } = useTranslation()
  const { fontScale } = useWindowDimensions()
  const styles = createStyles(tokens)
  return <View style={styles.picker}>
    {choosingYear ? <YearPicker selectedYear={year} tokens={tokens} onSelectYear={onSelectYear} /> :
      <View style={styles.months}>
        {Array.from({ length: 12 }, (_, month) => <View key={month} style={{ width: fontScale > 1.3 ? '50%' : '33.333333%', padding: 4 }}><Pressable accessibilityRole="button"
          accessibilityLabel={formatLocaleDate(new Date(year, month, 1), i18n.language, { month: 'long' })}
          accessibilityState={{ selected: month === currentMonth.getMonth() && year === currentMonth.getFullYear() }}
          style={({ pressed }) => [styles.month, month === currentMonth.getMonth() && year === currentMonth.getFullYear() && styles.selectedMonth, pressed && styles.pressed]} onPress={() => onSelectMonth(month, year)}>
          <Text style={styles.label}>{formatLocaleDate(new Date(year, month, 1), i18n.language, { month: 'short' })}</Text>
        </Pressable></View>)}
      </View>}
  </View>
}

export function CalendarHeader({ currentMonth, todayKey, previousMonthLabel, nextMonthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, onSelectMonth, period, viewSelector, tokens }: Readonly<CalendarHeaderProps>) {
  const { t, i18n } = useTranslation()
  const styles = createStyles(tokens)
  const heading = formatCalendarMonthHeading(currentMonth, todayKey, i18n.language)
  const [year, setYear] = useState(currentMonth.getFullYear())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [choosingYear, setChoosingYear] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const chooseMonth = (month: number, year: number) => closeSheet(() => { setPickerOpen(false); onSelectMonth(month, year) })
  return <View testID="calendar-header-group" style={styles.header}>
    <View testID={period ? `calendar-${period.view === 'agenda' ? 'week' : period.view}-navigation` : 'calendar-month-navigation'} style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel={period?.previousLabel ?? previousMonthLabel} onPress={period?.onPrevious ?? onPreviousMonth} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><ChevronLeft size={20} color={tokens.fg2} strokeWidth={2} /></Pressable>
      {period ? <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.period.goToCurrent', { period: period.label })} onPress={period.onCurrent} style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
        <Text style={styles.span}>{period.label}</Text>
      </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`${heading.month}${heading.year ? ` ${heading.year}` : ''}, ${t('calendar.monthPicker')}`} accessibilityState={{ expanded: pickerOpen }} onPress={() => { setYear(currentMonth.getFullYear()); setChoosingYear(false); setPickerOpen(true) }} style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
        <Text style={styles.title} numberOfLines={1}>{heading.month}{heading.year ? <Text style={styles.year}> {heading.year}</Text> : null}</Text>
        <ChevronDown size={16} color={tokens.fg2} strokeWidth={2} />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={period?.nextLabel ?? nextMonthLabel} onPress={period?.onNext ?? onNextMonth} disabled={period?.nextDisabled} accessibilityState={{ disabled: period?.nextDisabled }} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, period?.nextDisabled && { opacity: 0.4 }]}><ChevronRight size={20} color={tokens.fg2} strokeWidth={2} /></Pressable>
    </View>
    {viewSelector}
    {pickerOpen ? <Sheet ref={sheetRef} open accessibleTitle={t('calendar.monthPicker')} onClose={() => setPickerOpen(false)} virtualizedBody={choosingYear}
      headerAccessory={<Pressable accessibilityRole="button" accessibilityLabel={`${year}, ${t('common.selectYear')}`} accessibilityState={{ expanded: choosingYear }} onPress={() => setChoosingYear(!choosingYear)} style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}><Text style={styles.label}>{year}</Text><ChevronDown size={16} color={tokens.fg2} strokeWidth={2} /></Pressable>}
      actions={<PillButton size="sm" variant="ghost" onClick={() => closeSheet(() => { setPickerOpen(false); onCurrentMonth() })}>{t('calendar.thisMonth')}</PillButton>}>
      <CalendarMonthPicker currentMonth={currentMonth} tokens={tokens} onSelectMonth={chooseMonth} choosingYear={choosingYear} year={year} onSelectYear={(nextYear) => { setYear(nextYear); setChoosingYear(false) }} />
    </Sheet> : null}
  </View>
}

interface CalendarLegendProps {
  loggableLabel: string
  fullLabel: string
  partialLabel: string
  noneLabel: string
  tokens: Tokens
}

export function CalendarLegend({ loggableLabel, fullLabel, partialLabel, noneLabel, tokens }: Readonly<CalendarLegendProps>) {
  const styles = createStyles(tokens)
  return <View style={styles.legend}>
    <View style={styles.legendItem}><View testID="calendar-legend-full" style={styles.legendFull} /><Text style={styles.legendLabel}>{fullLabel}</Text></View>
    <View style={styles.legendItem}><Svg testID="calendar-legend-partial" width={14} height={14}>
      <Circle cx={7} cy={7} r={6.25} fill="none" stroke={tokens.statusEmpty} strokeWidth={1.5} />
      <Circle cx={7} cy={7} r={6.25} fill="none" stroke={tokens.primary} strokeDasharray={[Math.PI * 6.25, Math.PI * 12.5]} strokeWidth={1.5} rotation={-135} origin="7, 7" />
    </Svg><Text style={styles.legendLabel}>{partialLabel}</Text></View>
    <View style={styles.legendItem}><View testID="calendar-legend-none" style={styles.legendNone} /><Text style={styles.legendLabel}>{noneLabel}</Text></View>
    <View style={styles.legendItem}><View testID="calendar-legend-loggable" style={styles.legendLoggable} /><Text style={styles.legendLabel}>{loggableLabel}</Text></View>
  </View>
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    header: { gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    navigation: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
    iconButton: { minWidth: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: tokens.hairlineStrong, backgroundColor: 'transparent' },
    titleButton: { maxWidth: '100%', minWidth: 48, minHeight: 48, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: 'transparent' },
    pressed: { backgroundColor: tokens.bgHover },
    title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, color: tokens.fg1 },
    span: { fontFamily: 'GeistMono_400Regular', fontSize: 14, lineHeight: 19.6, color: tokens.fg2, fontVariant: ['tabular-nums'] },
    year: { color: tokens.fg2 },
    label: { fontFamily: 'Geist_500Medium', fontSize: 16, color: tokens.fg1 },
    selectedMonth: { borderWidth: 2, borderColor: tokens.fg1 },
    picker: { gap: 16, flexShrink: 1, minHeight: 0 },
    months: { flexDirection: 'row', flexWrap: 'wrap' },
    month: { minHeight: 48, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgField },
    legend: { gap: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendLabel: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 16, color: tokens.fg2 },
    legendFull: { width: 14, height: 14, borderRadius: 999, backgroundColor: tokens.fg1 },
    legendNone: { width: 14, height: 14, borderRadius: 999, borderWidth: 1.5, borderColor: tokens.statusEmpty },
    legendLoggable: { width: 14, height: 14, borderRadius: 999, borderWidth: 1, borderColor: tokens.hairline, backgroundColor: tokens.bgWell },
  })
}
