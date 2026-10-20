import { useMemo, useRef, useState, type Ref } from 'react'
import { View, Text } from 'react-native'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  getTimezoneList,
  buildPreferencePickerModel,
  type PreferencePicker,
} from '@orbit/shared/utils'
import { Sheet, type SheetHandle } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-row'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { styles, type Tokens } from '@/app/preferences-styles'

export type { PreferencePicker }

const TIME_ZONE_OPTIONS = getTimezoneList()
const TIME_ZONE_PAGE_SIZE = 20

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

function TimeZoneOptions({
  tokens,
  selected,
  searchLabel,
  noResultsLabel,
  showMoreLabel,
  onCommit,
}: Readonly<{
  tokens: Tokens
  selected?: string | null
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onCommit: (timeZone: string) => void
}>) {
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
          <PillButton
            size="sm"
            variant="ghost"
            onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}
          >
            {showMoreLabel}
          </PillButton>
        </View>
      ) : null}
    </View>
  )
}

interface PreferencePickerSheetProps {
  tokens: Tokens
  activePicker: PreferencePicker | null
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
  selectedLanguage: 'en' | 'pt-BR'
  currentTheme: ThemeMode
  timeZone?: string | null
  weekStartDay?: number
  uses24HourClock?: boolean
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  clockFormatOptions: { value: '24h' | '12h'; label: string }[]
  sheetRef: Ref<SheetHandle>
  closePicker: (exitAction?: () => void) => void
  onHidden: () => void
  onLanguageChange: (locale: 'en' | 'pt-BR') => void
  onThemeModeChange: (mode: ThemeMode) => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
  onClockFormatChange: (uses24HourClock: boolean) => void
}

function PickerContent({ props, commitSelection }: Readonly<{
  props: PreferencePickerSheetProps
  commitSelection: (apply: () => void) => void
}>) {
  if (props.activePicker === null) return null
  const model = buildPreferencePickerModel({ ...props, activePicker: props.activePicker, ready: true })
  if (model.kind === 'timeZone') {
    return <TimeZoneOptions
      tokens={props.tokens}
      selected={model.selected}
      searchLabel={props.timeZoneSearchLabel}
      noResultsLabel={props.timeZoneNoResultsLabel}
      showMoreLabel={props.timeZoneShowMoreLabel}
      onCommit={(value) => commitSelection(() => model.onCommit(value))}
    />
  }
  return <PickerOptions
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
