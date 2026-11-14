import { SPACING } from '@orbit/shared/theme'
import type { CalendarHeaderNavigationProps } from '@orbit/shared/utils/calendar-navigation'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions, type PressableProps } from 'react-native'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import { ChevronDown, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { YearPicker } from '@/components/ui/year-picker'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ThemedIconButton } from '@/components/ui/icon-button'
import { formatAPIDate, formatCalendarMonthHeading, formatLocaleDate, parseAPIDate, resolveCalendarJumpPhrase } from '@orbit/shared/utils'
import { subMonths } from 'date-fns'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'

type Tokens = ReturnType<typeof createTokensV2>

interface CalendarHeaderProps extends CalendarHeaderNavigationProps {
  viewSelector?: ReactNode
  /** The Orbit line row, between the period navigation and the view switch. */
  orbitLine?: ReactNode
  /** The guided flows: the month picker asks one question with quick options and a typed date. */
  guided?: boolean
  onSelectDate?: (date: string) => void
  tokens: Tokens
}

interface CalendarJumpQuestionProps {
  currentMonth: Date
  todayKey: string
  onToday: () => void
  onMonth: (month: number, year: number) => void
  onDate: (date: string) => void
}

/** The quick options and the typed date of the month picker. The typed date is read on the device: "dia 20" is day 20 of the shown month. */
function CalendarJumpQuestion({ currentMonth, todayKey, onToday, onMonth, onDate }: Readonly<CalendarJumpQuestionProps>) {
  const { t, i18n } = useTranslation()
  const [phrase, setPhrase] = useState('')
  const [unresolved, setUnresolved] = useState(false)
  const lastMonth = subMonths(parseAPIDate(todayKey), 1)
  const submit = () => {
    const date = resolveCalendarJumpPhrase(phrase, { monthStart: formatAPIDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)), todayKey, locale: i18n.language, timeZone: null })
    if (date) onDate(date)
    else setUnresolved(true)
  }
  return <View testID="calendar-jump-question" style={jumpStyles.question}>
    <View style={jumpStyles.options}>
      <View style={jumpStyles.option}><OptionCard label={t('dates.today')} onSelect={onToday} /></View>
      <View style={jumpStyles.option}><OptionCard label={t('calendar.monthPickerLastMonth')} onSelect={() => onMonth(lastMonth.getMonth(), lastMonth.getFullYear())} /></View>
    </View>
    <View style={jumpStyles.freePath}>
      <Input label={t('calendar.monthPickerTyped')} value={phrase} placeholder={t('calendar.monthPickerTypedPlaceholder')} autoComplete="off"
        onChange={(value) => { setPhrase(value); setUnresolved(false) }} onSubmit={submit}
        error={unresolved ? t('calendar.monthPickerTypedUnresolved') : undefined} />
      <View style={jumpStyles.action}><PillButton size="sm" variant="secondary" onClick={submit}>{t('calendar.monthPickerTypedSubmit')}</PillButton></View>
    </View>
  </View>
}

const jumpStyles = StyleSheet.create({
  question: { gap: SPACING.s24 },
  options: { flexDirection: 'row', gap: SPACING.s12 },
  option: { flex: 1, minWidth: 0 },
  freePath: { gap: SPACING.s12 },
  action: { flexDirection: 'row' },
})

function CalendarTitleControl({ tokens, compact = false, insetPaint = false, ...props }: Readonly<Pick<PressableProps, 'children' | 'accessibilityLabel' | 'accessibilityState' | 'onPress'> & { tokens: Tokens; compact?: boolean; insetPaint?: boolean }>) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const styles = createStyles(tokens)
  return <Pressable {...props} accessibilityRole="button" focusOffset={insetPaint ? -2 : -4} hitSlop={insetPaint ? { left: 8, right: 8, top: 0, bottom: 0 } : undefined}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    onFocus={(event) => { if (event.target === event.currentTarget) setFocused(true) }}
    onBlur={(event) => { if (event.target === event.currentTarget) setFocused(false) }}
    style={({ pressed }) => [styles.titleButton, compact && styles.monthTitleButton, insetPaint && styles.pickerButton, !insetPaint && !props.accessibilityState?.disabled && (pressed || hovered || focused) && styles.pressed]}>
    {(state) => <>{insetPaint ? <View pointerEvents="none" accessible={false} data-press-fill="" style={[styles.pickerPaint, !props.accessibilityState?.disabled && (state.pressed || hovered || focused) && styles.pressed]} /> : null}{typeof props.children === 'function' ? props.children(state) : props.children}</>}
  </Pressable>
}

function CalendarMonthPicker({ currentMonth, tokens, onSelectMonth, choosingYear, year, onSelectYear }: Readonly<Pick<CalendarHeaderProps, 'currentMonth' | 'tokens' | 'onSelectMonth'> & { choosingYear: boolean; year: number; onSelectYear: (year: number) => void }>) {
  const { i18n } = useTranslation()
  const { fontScale } = useWindowDimensions()
  const styles = createStyles(tokens)
  return <View style={styles.picker}>
    {choosingYear ? <YearPicker selectedYear={year} tokens={tokens} onSelectYear={onSelectYear} /> :
      <View style={styles.months}>
        {Array.from({ length: 12 }, (_, month) => <View key={month} style={{ width: fontScale > 1.3 ? '50%' : '33.333333%', padding: SPACING.s4 }}><Pressable accessibilityRole="button"
          accessibilityLabel={formatLocaleDate(new Date(year, month, 1), i18n.language, { month: 'long' })}
          accessibilityState={{ selected: month === currentMonth.getMonth() && year === currentMonth.getFullYear() }}
          style={({ pressed }) => [styles.month, month === currentMonth.getMonth() && year === currentMonth.getFullYear() && styles.selectedMonth, pressed && styles.pressed]} onPress={() => onSelectMonth(month, year)}>
          <Text style={styles.label}>{formatLocaleDate(new Date(year, month, 1), i18n.language, { month: 'short' })}</Text>
        </Pressable></View>)}
      </View>}
  </View>
}

interface CalendarMonthPickerSheetProps extends Pick<CalendarHeaderProps, 'currentMonth' | 'todayKey' | 'tokens' | 'guided' | 'onCurrentMonth' | 'onSelectMonth' | 'onSelectDate'> {
  onClose: () => void
}

/** The month picker. With the guided flows on it asks one question: two quick options, then the typed date and the month grid as the free path. */
function CalendarMonthPickerSheet({ currentMonth, todayKey, tokens, guided = false, onCurrentMonth, onSelectMonth, onSelectDate, onClose }: Readonly<CalendarMonthPickerSheetProps>) {
  const { t } = useTranslation()
  const styles = createStyles(tokens)
  const [year, setYear] = useState(currentMonth.getFullYear())
  const [choosingYear, setChoosingYear] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const closePicker = (choose: () => void) => closeSheet(() => { onClose(); choose() })
  const chooseMonth = (month: number, nextYear: number) => closePicker(() => onSelectMonth(month, nextYear))
  return <Sheet ref={sheetRef} open title={guided ? t('calendar.monthPickerQuestion') : undefined} accessibleTitle={guided ? undefined : t('calendar.monthPicker')} onClose={onClose} virtualizedBody={choosingYear}
    headerAccessory={<CalendarTitleControl tokens={tokens} accessibilityLabel={`${year}, ${t('common.selectYear')}`} accessibilityState={{ expanded: choosingYear }} onPress={() => setChoosingYear(!choosingYear)}><Text style={styles.label}>{year}</Text><ChevronDown size={16} color={tokens.fg2} strokeWidth={2} /></CalendarTitleControl>}>
    <View style={styles.pickerBody}>
      {guided && !choosingYear ? <CalendarJumpQuestion currentMonth={currentMonth} todayKey={todayKey}
        onToday={() => closePicker(onCurrentMonth)} onMonth={chooseMonth} onDate={(date) => closePicker(() => onSelectDate?.(date))} /> : null}
      <CalendarMonthPicker currentMonth={currentMonth} tokens={tokens} onSelectMonth={chooseMonth} choosingYear={choosingYear} year={year} onSelectYear={(nextYear) => { setYear(nextYear); setChoosingYear(false) }} />
    </View>
  </Sheet>
}

export function CalendarHeader({ currentMonth, todayKey, isTodaySelected = false, previousMonthLabel, nextMonthLabel, onPreviousMonth, onNextMonth, onCurrentMonth, onSelectMonth, period, viewSelector, orbitLine, guided = false, onSelectDate, tokens }: Readonly<CalendarHeaderProps>) {
  const { t, i18n } = useTranslation()
  const styles = createStyles(tokens)
  const heading = formatCalendarMonthHeading(currentMonth, todayKey, i18n.language)
  const [pickerOpen, setPickerOpen] = useState(false)
  const returnToToday = () => { if (!isTodaySelected) (period?.onCurrent ?? onCurrentMonth)() }
  return <View testID="calendar-header-group" style={styles.header}>
    <View testID={period ? `calendar-${period.view === 'agenda' ? 'week' : period.view}-navigation` : 'calendar-month-navigation'} style={styles.navigation}>
      <ThemedIconButton tokens={tokens} borderless={false} label={period?.previousLabel ?? previousMonthLabel} onPress={period?.onPrevious ?? onPreviousMonth}><ChevronLeft size={20} color={tokens.fg2} strokeWidth={2} /></ThemedIconButton>
      <View style={[styles.monthTitleGroup, !period && styles.monthPickerGroup]}>
        <CalendarTitleControl tokens={tokens} compact={!period}
          accessibilityLabel={period ? t('calendar.period.goToCurrent', { period: period.label }) : `${heading.month}${heading.year ? ` ${heading.year}` : ''}, ${t('dates.goToToday')}`}
          accessibilityState={{ disabled: isTodaySelected }} onPress={returnToToday}>
          {period ? <Text style={styles.span}>{period.label}</Text> : <Text style={styles.title}>{heading.month}{heading.year ? <Text style={styles.year}> {heading.year}</Text> : null}</Text>}
        </CalendarTitleControl>
        {!period ? <CalendarTitleControl tokens={tokens} insetPaint accessibilityLabel={`${heading.month}${heading.year ? ` ${heading.year}` : ''}, ${t('calendar.monthPicker')}`} accessibilityState={{ expanded: pickerOpen }} onPress={() => setPickerOpen(true)}>
          <ChevronDown size={16} color={tokens.fg2} strokeWidth={2} />
        </CalendarTitleControl> : null}
      </View>
      <ThemedIconButton tokens={tokens} borderless={false} label={period?.nextLabel ?? nextMonthLabel} onPress={period?.onNext ?? onNextMonth} disabled={period?.nextDisabled}><ChevronRight size={20} color={tokens.fg2} strokeWidth={2} /></ThemedIconButton>
    </View>
    {orbitLine}
    {viewSelector}
    {pickerOpen ? <CalendarMonthPickerSheet currentMonth={currentMonth} todayKey={todayKey} tokens={tokens} guided={guided} onCurrentMonth={onCurrentMonth}
      onSelectMonth={onSelectMonth} onSelectDate={onSelectDate} onClose={() => setPickerOpen(false)} /> : null}
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
    header: { gap: 16, paddingHorizontal: SPACING.s16, paddingTop: SPACING.s12, paddingBottom: SPACING.s24 },
    navigation: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: SPACING.s8 },
    pickerPaint: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12 },
    pickerButton: { minWidth: SPACING.s32, width: SPACING.s32, paddingHorizontal: SPACING.s0 },
    monthPickerGroup: { gap: SPACING.s8, paddingEnd: SPACING.s4 },
    monthTitleGroup: { maxWidth: '100%', flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
    monthTitleButton: { flexShrink: 0, paddingHorizontal: SPACING.s8 },
    titleButton: { maxWidth: '100%', minWidth: 48, minHeight: 48, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: 'transparent' },
    pressed: { backgroundColor: tokens.bgHover },
    title: { flexShrink: 1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26.4, color: tokens.fg1 },
    span: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 14, lineHeight: 19.6, color: tokens.fg2, fontVariant: ['tabular-nums'] },
    year: { color: tokens.fg2 },
    label: { fontFamily: 'Geist_500Medium', fontSize: 16, color: tokens.fg1 },
    selectedMonth: { borderWidth: 2, borderColor: tokens.fg1 },
    picker: { gap: 16, flexShrink: 1, minHeight: 0 },
    pickerBody: { gap: SPACING.s24, flexShrink: 1, minHeight: 0 },
    months: { flexDirection: 'row', flexWrap: 'wrap' },
    month: { minHeight: 48, padding: SPACING.s8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: tokens.bgField },
    legend: { gap: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendLabel: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 16, color: tokens.fg2 },
    legendFull: { width: 14, height: 14, borderRadius: 999, backgroundColor: tokens.fg1 },
    legendNone: { width: 14, height: 14, borderRadius: 999, borderWidth: 1.5, borderColor: tokens.statusEmpty },
    legendLoggable: { width: 14, height: 14, borderRadius: 999, borderWidth: 1, borderColor: tokens.hairline, backgroundColor: tokens.bgWell },
  })
}
