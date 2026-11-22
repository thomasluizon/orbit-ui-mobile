import { ChevronDown } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'
import { useEffect, useRef, useState, type Ref } from 'react'
import { motionPresets } from '@orbit/shared/theme'
import { StyleSheet, View, Text } from 'react-native'
import {
  buildGuidedTimeZoneOptions,
  getClientTimeZone,
  getTimezoneList,
  buildPreferencePickerModel,
  TIME_ZONE_PAGE_SIZE,
  type PreferencePicker,
} from '@orbit/shared/utils'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { usePrefersReducedMotion } from '@/lib/motion'

import { styles, type Tokens } from '@/app/preferences-styles'

export type { PreferencePicker }

const TIME_ZONE_OPTIONS = getTimezoneList()

function QuickOptions<Value extends string | number>({ label, options, selected, onCommit }: Readonly<{
  label: string
  options: readonly { value: Value; label: string }[]
  selected: Value | null
  onCommit: (value: Value) => void
}>) {
  const [answer, setAnswer] = useState<Value | null>(null)
  return (
    <View testID="preference-quick-options" accessibilityLabel={label} style={quickOptions.grid}>
      {options.map((option) => (
        <OptionCard key={String(option.value)} label={option.label} selected={(answer ?? selected) === option.value} onSelect={() => { setAnswer(option.value); onCommit(option.value) }} />
      ))}
    </View>
  )
}

const quickOptions = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 } })

interface TimeZoneOptionsProps {
  tokens: Tokens
  selected?: string | null
  questionLabel: string
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onCommit: (timeZone: string) => void
}

function GuidedTimeZoneOptions({ tokens, selected, questionLabel, searchLabel, noResultsLabel, showMoreLabel, onCommit }: Readonly<TimeZoneOptionsProps>) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(TIME_ZONE_PAGE_SIZE)
  const [deviceTimeZone] = useState(getClientTimeZone)
  const [answer, setAnswer] = useState<string | null>(null)
  const { quick, searched, visible, hasMore } = buildGuidedTimeZoneOptions({ zones: TIME_ZONE_OPTIONS, selected, deviceTimeZone, query, visibleCount })
  const option = (zone: string) => <OptionCard key={zone} wide label={zone} selected={zone === (answer ?? selected)} onSelect={() => { setAnswer(zone); onCommit(zone) }} />
  return (
    <View testID="time-zone-question" style={guidedTimeZone.column}>
      <View testID="time-zone-quick-options" accessibilityLabel={questionLabel} style={guidedTimeZone.options}>{quick.map(option)}</View>
      <Input kind="search" label={searchLabel} autoComplete="off" value={query} onChange={(value) => { setQuery(value); setVisibleCount(TIME_ZONE_PAGE_SIZE) }} />
      {searched && visible.length === 0 ? <Text accessibilityLiveRegion="polite" style={[guidedTimeZone.miss, { color: tokens.fg3 }]}>{noResultsLabel}</Text> : null}
      {visible.length > 0 ? <View accessibilityLabel={searchLabel} style={guidedTimeZone.options}>{visible.map(option)}</View> : null}
      {hasMore ? <View style={guidedTimeZone.more}>
        <IconButton label={showMoreLabel} onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </View> : null}
    </View>
  )
}

const guidedTimeZone = StyleSheet.create({
  column: { gap: 12 },
  options: { gap: 12 },
  miss: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  more: { alignItems: 'center' },
})

interface PreferencePickerSheetProps {
  tokens: Tokens
  activePicker: PreferencePicker | null
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
  selectedLanguage: 'en' | 'pt-BR'
  timeZone?: string | null
  weekStartDay?: number
  uses24HourClock?: boolean
  weekStartOptions: { value: 0 | 1; label: string }[]
  clockFormatOptions: { value: '24h' | '12h'; label: string }[]
  sheetRef: Ref<SheetHandle>
  closePicker: (exitAction?: () => void) => void
  onHidden: () => void
  onLanguageChange: (locale: 'en' | 'pt-BR') => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
  onClockFormatChange: (uses24HourClock: boolean) => void
}

function PickerContent({ props, commitSelection }: Readonly<{
  props: PreferencePickerSheetProps
  commitSelection: (apply: () => void, settle: boolean) => void
}>) {
  if (props.activePicker === null) return null
  const model = buildPreferencePickerModel({ ...props, activePicker: props.activePicker, ready: true })
  if (model.kind === 'timeZone') {
    const TimeZones = GuidedTimeZoneOptions
    return <TimeZones
      tokens={props.tokens}
      questionLabel={props.pickerTitles.timeZone}
      selected={model.selected}
      searchLabel={props.timeZoneSearchLabel}
      noResultsLabel={props.timeZoneNoResultsLabel}
      showMoreLabel={props.timeZoneShowMoreLabel}
      onCommit={(value) => commitSelection(() => model.onCommit(value), true)}
    />
  }
  const Options = QuickOptions
  return <Options
    label={model.label}
    options={model.options}
    selected={model.selected}
    onCommit={(value) => commitSelection(() => model.onCommit(value), true)}
  />
}

export function PreferencePickerSheet(props: Readonly<PreferencePickerSheetProps>) {
  const { activePicker, tokens, pickerTitles, pickerDescriptions, sheetRef,
    closePicker, onHidden } = props
  const reducedMotion = usePrefersReducedMotion()
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settleTimer.current), [])
  const close = (apply: () => void) => closePicker(() => {
    onHidden()
    apply()
  })
  const commitSelection = (apply: () => void, settle: boolean) => {
    clearTimeout(settleTimer.current)
    if (!settle || reducedMotion) close(apply)
    else settleTimer.current = setTimeout(() => close(apply), motionPresets.selection.enterDuration)
  }
  if (activePicker === null) return null

  return <Sheet ref={sheetRef} open onClose={onHidden} title={pickerTitles[activePicker]} key={activePicker}>
    <View style={styles.sheetContent}>
      {pickerDescriptions[activePicker] ? (
        <Text style={[styles.sheetDescription, { color: tokens.fg3 }]}>
          {pickerDescriptions[activePicker]}
        </Text>
      ) : null}
      <PickerContent props={props} commitSelection={commitSelection} />
    </View>
  </Sheet>
}
