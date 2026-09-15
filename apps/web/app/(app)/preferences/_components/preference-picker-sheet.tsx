'use client'

import { useMemo, useState } from 'react'
import { getTimezoneList, LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'

export type PreferencePicker = 'language' | 'theme' | 'timeZone' | 'weekStart'

const TIME_ZONE_OPTIONS = getTimezoneList()
const TIME_ZONE_PAGE_SIZE = 20

function TimeZoneOptions({
  selected,
  searchLabel,
  noResultsLabel,
  showMoreLabel,
  onSelect,
}: Readonly<{
  selected?: string | null
  searchLabel: string
  noResultsLabel: string
  showMoreLabel: string
  onSelect: (timeZone: string) => void
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
      <div role="radiogroup" aria-label={searchLabel}>
        {visible.map((option, index) => (
          <RadioRow
            key={option}
            label={option}
            selected={selected === option}
            divider={index < visible.length - 1}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
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
  selectedLanguage: string
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
  const selectAndClose = (apply: () => void) =>
    closeSheet(() => {
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
      {activePicker === 'language' &&
        LANGUAGE_OPTIONS.map((lang, index) => (
          <RadioRow
            key={lang.value}
            label={lang.label}
            selected={mounted && selectedLanguage === lang.value}
            divider={index < LANGUAGE_OPTIONS.length - 1}
            onClick={() => selectAndClose(() => onLanguageChange(lang.value))}
          />
        ))}
      {activePicker === 'theme' &&
        themeModeOptions.map((mode, index) => (
          <RadioRow
            key={mode.value}
            label={mode.label}
            selected={mounted && currentTheme === mode.value}
            divider={index < themeModeOptions.length - 1}
            onClick={() => selectAndClose(() => onThemeModeChange(mode.value))}
          />
        ))}
      {activePicker === 'timeZone' ? (
        <TimeZoneOptions
          selected={mounted ? timeZone : null}
          searchLabel={timeZoneSearchLabel}
          noResultsLabel={timeZoneNoResultsLabel}
          showMoreLabel={timeZoneShowMoreLabel}
          onSelect={(option) => selectAndClose(() => onTimeZoneChange(option))}
        />
      ) : null}
      {activePicker === 'weekStart' &&
        weekStartOptions.map((option, index) => (
          <RadioRow
            key={option.value}
            label={option.label}
            selected={mounted && weekStartDay === option.value}
            divider={index < weekStartOptions.length - 1}
            onClick={() => selectAndClose(() => onWeekStartChange(option.value))}
          />
        ))}
    </Sheet>
  )
}
