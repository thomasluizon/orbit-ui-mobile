'use client'

import { useMemo, useRef, useState } from 'react'
import { getTimezoneList, LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-row'

export type PreferencePicker = 'language' | 'theme' | 'timeZone' | 'weekStart'

const TIME_ZONE_OPTIONS = getTimezoneList()
const TIME_ZONE_PAGE_SIZE = 20

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

function TimeZoneOptions({
  selected,
  searchLabel,
  noResultsLabel,
  showMoreLabel,
  onCommit,
}: Readonly<{
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
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 font-sans text-sm text-[var(--fg-2)]">
        <span>{searchLabel}</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(TIME_ZONE_PAGE_SIZE)
          }}
          className="form-input mb-1"
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
          <PillButton
            size="sm"
            variant="ghost"
            onClick={() => setVisibleCount((count) => count + TIME_ZONE_PAGE_SIZE)}
          >
            {showMoreLabel}
          </PillButton>
        </div>
      ) : null}
    </div>
  )
}

interface PreferencePickerSheetProps {
  activePicker: PreferencePicker | null
  mounted: boolean
  selectedLanguage: SupportedLocale
  currentTheme: ThemeMode
  timeZone?: string | null
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
  onClose: () => void
  onLanguageChange: (locale: SupportedLocale) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
}

export function PreferencePickerSheet({
  activePicker,
  mounted,
  selectedLanguage,
  currentTheme,
  timeZone,
  weekStartDay,
  themeModeOptions,
  weekStartOptions,
  pickerTitles,
  pickerDescriptions,
  timeZoneSearchLabel,
  timeZoneNoResultsLabel,
  timeZoneShowMoreLabel,
  onClose,
  onLanguageChange,
  onThemeModeChange,
  onTimeZoneChange,
  onWeekStartChange,
}: Readonly<PreferencePickerSheetProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const commitSelection = (apply: () => void) => closeSheet(() => {
    onClose()
    apply()
  })
  if (activePicker === null) return null

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={onClose}
      title={pickerTitles[activePicker]}
    >
      <p className="mb-3 text-sm text-[var(--fg-3)]">
        {pickerDescriptions[activePicker]}
      </p>
      {activePicker === 'language' ? (
        <PickerOptions
          label={pickerTitles.language}
          options={LANGUAGE_OPTIONS}
          selected={mounted ? selectedLanguage : null}
          onCommit={(locale) => commitSelection(() => onLanguageChange(locale))}
        />
      ) : null}
      {activePicker === 'theme' ? (
        <PickerOptions
          label={pickerTitles.theme}
          options={themeModeOptions}
          selected={mounted ? currentTheme : null}
          onCommit={(mode) => commitSelection(() => onThemeModeChange(mode))}
        />
      ) : null}
      {activePicker === 'timeZone' ? (
        <TimeZoneOptions
          selected={mounted ? timeZone : null}
          searchLabel={timeZoneSearchLabel}
          noResultsLabel={timeZoneNoResultsLabel}
          showMoreLabel={timeZoneShowMoreLabel}
          onCommit={(nextTimeZone) => commitSelection(() => onTimeZoneChange(nextTimeZone))}
        />
      ) : null}
      {activePicker === 'weekStart' ? (
        <PickerOptions
          label={pickerTitles.weekStart}
          options={weekStartOptions}
          selected={mounted && (weekStartDay === 0 || weekStartDay === 1) ? weekStartDay : null}
          onCommit={(day) => commitSelection(() => onWeekStartChange(day))}
        />
      ) : null}
    </Sheet>
  )
}
