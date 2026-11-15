import { ChevronDown } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'
import { useMemo, useRef, useState, type Ref } from 'react'
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
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { useFlag } from '@/hooks/use-flag'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'

import { styles, type Tokens } from '@/app/preferences-styles'

export type { PreferencePicker }

const TIME_ZONE_OPTIONS = getTimezoneList()

/** Focus moves the draft and only a press commits it, so arrow keys never write a preference per keypress. */
function PickerOptions<Value extends string | number>({
  label,
  options,
  selected,
  onCommit,
}: Readonly<{
  label: string
  options: readonly { value: Value; label: string }[]
  selected: Value | null
  onCommit: (value: Value) => void
}>) {
  const [draft, setDraft] = useState<Value | null>(null)
  const draftRef = useRef<Value | null>(null)
  /** Null until focus moves, so a profile that resolves after the first render still checks its row. */
  const checked = draft ?? selected
  const selectDraft = (next: Value) => {
    draftRef.current = next
    setDraft(next)
  }
  const commitDraft = () => {
    const pending = draftRef.current ?? selected
    if (pending !== null) onCommit(pending)
  }

  return (
    <RadioGroup accessibilityLabel={label} onCommit={commitDraft}>
      {options.map((option) => (
        <RadioRow
          key={String(option.value)}
          label={option.label}
          selected={checked === option.value}
          onSelect={() => selectDraft(option.value)}
        />
      ))}
    </RadioGroup>
  )
}

/** With `orbit_guided_flows` on, a short picker shows its answers as quick options: a press answers and closes the sheet. */
function QuickOptions<Value extends string | number>({ label, options, selected, onCommit }: Readonly<{
  label: string
  options: readonly { value: Value; label: string }[]
  selected: Value | null
  onCommit: (value: Value) => void
}>) {
  return (
    <View testID="preference-quick-options" accessibilityLabel={label} style={quickOptions.grid}>
      {options.map((option) => (
        <OptionCard key={String(option.value)} label={option.label} selected={selected === option.value} onSelect={() => onCommit(option.value)} />
      ))}
    </View>
  )
}

const quickOptions = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 } })

interface TimeZoneOptionsProps {
  tokens: Tokens
  selected?: string | null
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onCommit: (timeZone: string) => void
}

function TimeZoneOptions({
  tokens,
  selected,
  searchLabel,
  noResultsLabel,
  showMoreLabel,
  onCommit,
}: Readonly<TimeZoneOptionsProps>) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(TIME_ZONE_PAGE_SIZE)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? TIME_ZONE_OPTIONS.filter((option) => option.toLocaleLowerCase().includes(normalized))
      : TIME_ZONE_OPTIONS
  }, [query])
  const ordered = selected && filtered.includes(selected)
    ? [selected, ...filtered.filter((option) => option !== selected)]
    : filtered
  const visible = ordered.slice(0, visibleCount)

  return (
    <View style={styles.timeZoneOptions}>
      <Text style={[styles.timeZoneSearchLabel, { color: tokens.fg2 }]}>
        {searchLabel}
      </Text>
      <BottomSheetAppTextInput
        value={query}
        onChangeText={(value) => {
          setQuery(value)
          setVisibleCount(TIME_ZONE_PAGE_SIZE)
        }}
        accessibilityLabel={searchLabel}
        placeholder={searchLabel}
        style={styles.timeZoneSearch}
      />
      <PickerOptions
        label={searchLabel}
        options={visible.map((option) => ({ label: option, value: option }))}
        selected={selected ?? null}
        onCommit={onCommit}
      />
      {visible.length === 0 ? (
        <Text style={[styles.timeZoneEmpty, { color: tokens.fg3 }]}>{noResultsLabel}</Text>
      ) : null}
      {visibleCount < ordered.length ? (
        <View style={styles.timeZoneMore}>
          <IconButton label={showMoreLabel} onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton>
        </View>
      ) : null}
    </View>
  )
}

/**
 * With `orbit_guided_flows` on, the time zone question follows the pattern of the short pickers: the stored time zone and the
 * time zone of the device are the quick options, and the search is the free path to every other time zone. A press answers and closes the sheet.
 */
function GuidedTimeZoneOptions({ tokens, selected, searchLabel, noResultsLabel, showMoreLabel, onCommit }: Readonly<TimeZoneOptionsProps>) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(TIME_ZONE_PAGE_SIZE)
  const [deviceTimeZone] = useState(getClientTimeZone)
  const { quick, searched, visible, hasMore } = buildGuidedTimeZoneOptions({ zones: TIME_ZONE_OPTIONS, selected, deviceTimeZone, query, visibleCount })
  const option = (zone: string) => <OptionCard key={zone} wide label={zone} selected={zone === selected} onSelect={() => onCommit(zone)} />
  return (
    <View testID="time-zone-question" style={guidedTimeZone.column}>
      <View accessibilityLabel={selected ?? searchLabel} style={guidedTimeZone.options}>{quick.map(option)}</View>
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
  commitSelection: (apply: () => void) => void
}>) {
  const guided = useFlag('orbit_guided_flows')
  if (props.activePicker === null) return null
  const model = buildPreferencePickerModel({ ...props, activePicker: props.activePicker, ready: true })
  if (model.kind === 'timeZone') {
    const TimeZones = guided ? GuidedTimeZoneOptions : TimeZoneOptions
    return <TimeZones
      tokens={props.tokens}
      selected={model.selected}
      searchLabel={props.timeZoneSearchLabel}
      noResultsLabel={props.timeZoneNoResultsLabel}
      showMoreLabel={props.timeZoneShowMoreLabel}
      onCommit={(value) => commitSelection(() => model.onCommit(value))}
    />
  }
  const Options = guided ? QuickOptions : PickerOptions
  return <Options
    label={model.label}
    options={model.options}
    selected={model.selected}
    onCommit={(value) => commitSelection(() => model.onCommit(value))}
  />
}

export function PreferencePickerSheet(props: Readonly<PreferencePickerSheetProps>) {
  const { activePicker, tokens, pickerTitles, pickerDescriptions, sheetRef,
    closePicker, onHidden } = props
  const commitSelection = (apply: () => void) => closePicker(() => {
    onHidden()
    apply()
  })
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
