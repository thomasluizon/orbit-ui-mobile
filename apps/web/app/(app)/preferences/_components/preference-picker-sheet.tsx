'use client'

import { ChevronDown } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'

import { useMemo, useRef, useState } from 'react'
import { buildGuidedTimeZoneOptions, buildPreferencePickerModel, getClientTimeZone, getTimezoneList, TIME_ZONE_PAGE_SIZE, type PreferencePicker } from '@orbit/shared/utils'
import type { SupportedLocale } from '@orbit/shared/types/profile'

import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { useFlag } from '@/hooks/use-flag'

export type { PreferencePicker }

const TIME_ZONE_OPTIONS = getTimezoneList()

/** Arrow keys move the draft and only an activation commits it, so navigating never writes a preference per keypress. */
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
    <RadioGroup aria-label={label} onCommit={commitDraft}>
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

/** With `orbit_guided_flows` on, a short picker shows its answers as quick options: a press answers and closes the sheet. Arrow keys move focus and never select. */
function QuickOptions<Value extends string | number>({ label, options, selected, onCommit }: Readonly<{
  label: string
  options: readonly { value: Value; label: string }[]
  selected: Value | null
  onCommit: (value: Value) => void
}>) {
  return (
    <div role="group" aria-label={label} data-option-group="" className="grid grid-cols-2 gap-3">
      {options.map((option) => (
        <OptionCard key={String(option.value)} label={option.label} selected={selected === option.value} onSelect={() => onCommit(option.value)} />
      ))}
    </div>
  )
}

function TimeZoneOptions({
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
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 font-sans text-sm text-[var(--fg-2)]">
        <span>{searchLabel}</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(TIME_ZONE_PAGE_SIZE)
          }}
          className="form-input orbit-field-hover mb-1"
          style={{ borderRadius: 12 }}
          placeholder={searchLabel}
        />
      </label>
      <PickerOptions
        label={searchLabel}
        options={visible.map((option) => ({ label: option, value: option }))}
        selected={selected ?? null}
        onCommit={onCommit}
      />
      {visible.length === 0 ? (
        <p className="m-0 px-1 py-4 text-sm text-[var(--fg-3)]">{noResultsLabel}</p>
      ) : null}
      {visibleCount < ordered.length ? (
        <div>
          <IconButton label={showMoreLabel} onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        </div>
      ) : null}
    </div>
  )
}

interface TimeZoneOptionsProps {
  selected?: string | null
  /** The question of the sheet: the accessible name of the quick options in guided mode. */
  questionLabel: string
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onCommit: (timeZone: string) => void
}

/**
 * With `orbit_guided_flows` on, the time zone question follows the pattern of the short pickers: the stored time zone and the
 * time zone of the device are the quick options, and the search is the free path to every other time zone. A press answers and closes the sheet.
 */
function GuidedTimeZoneOptions({ selected, questionLabel, searchLabel, noResultsLabel, showMoreLabel, onCommit }: Readonly<TimeZoneOptionsProps>) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(TIME_ZONE_PAGE_SIZE)
  const [deviceTimeZone] = useState(getClientTimeZone)
  const { quick, searched, visible, hasMore } = buildGuidedTimeZoneOptions({ zones: TIME_ZONE_OPTIONS, selected, deviceTimeZone, query, visibleCount })
  const option = (zone: string) => <OptionCard key={zone} wide label={zone} selected={zone === selected} onSelect={() => onCommit(zone)} />
  return (
    <div data-time-zone-question="" className="flex flex-col gap-3">
      <div role="group" aria-label={questionLabel} data-option-group="" className="grid grid-cols-2 gap-3">{quick.map(option)}</div>
      <Input kind="search" label={searchLabel} name="timeZoneSearch" autoComplete="off" value={query} onChange={(value) => { setQuery(value); setVisibleCount(TIME_ZONE_PAGE_SIZE) }} />
      {searched && visible.length === 0 ? <p role="status" className="text-center text-sm text-[var(--fg-3)]">{noResultsLabel}</p> : null}
      {visible.length > 0 ? <div role="group" aria-label={searchLabel} data-option-group="" className="grid grid-cols-2 gap-3">{visible.map(option)}</div> : null}
      {hasMore ? <div className="flex justify-center">
        <IconButton label={showMoreLabel} onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </div> : null}
    </div>
  )
}

interface PreferencePickerSheetProps {
  activePicker: PreferencePicker | null
  mounted: boolean
  selectedLanguage: SupportedLocale
  timeZone?: string | null
  weekStartDay?: number
  uses24HourClock?: boolean
  weekStartOptions: { value: 0 | 1; label: string }[]
  clockFormatOptions: { value: '24h' | '12h'; label: string }[]
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
  onClose: () => void
  onLanguageChange: (locale: SupportedLocale) => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
  onClockFormatChange: (uses24HourClock: boolean) => void
}

function PickerContent({
  props,
  commitSelection,
}: Readonly<{
  props: PreferencePickerSheetProps
  commitSelection: (apply: () => void) => void
}>) {
  const guided = useFlag('orbit_guided_flows')
  if (props.activePicker === null) return null
  const model = buildPreferencePickerModel({ ...props, activePicker: props.activePicker, ready: props.mounted })
  if (model.kind === 'timeZone') {
    const TimeZones = guided ? GuidedTimeZoneOptions : TimeZoneOptions
    return <TimeZones
      selected={model.selected}
      questionLabel={props.pickerTitles.timeZone}
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
  const { activePicker, pickerTitles, pickerDescriptions, onClose } = props
  const { sheetRef, closeSheet } = useSheetHost()
  const commitSelection = (apply: () => void) => closeSheet(() => {
    onClose()
    apply()
  })
  if (activePicker === null) return null

  return (
    <Sheet ref={sheetRef} open onClose={onClose} title={pickerTitles[activePicker]}>
      {pickerDescriptions[activePicker] ? <p className="mb-3 text-sm text-[var(--fg-3)]">
        {pickerDescriptions[activePicker]}
      </p> : null}
      <PickerContent props={props} commitSelection={commitSelection} />
    </Sheet>
  )
}
