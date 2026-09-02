'use client'

import { LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'

export type PreferencePicker = 'language' | 'theme' | 'weekStart'

interface PreferencePickerSheetProps {
  activePicker: PreferencePicker | null
  mounted: boolean
  selectedLanguage: string
  currentTheme: ThemeMode
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  onClose: () => void
  onLanguageChange: (locale: SupportedLocale) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onWeekStartChange: (day: 0 | 1) => void
}

export function PreferencePickerSheet({
  activePicker,
  mounted,
  selectedLanguage,
  currentTheme,
  weekStartDay,
  themeModeOptions,
  weekStartOptions,
  pickerTitles,
  pickerDescriptions,
  onClose,
  onLanguageChange,
  onThemeModeChange,
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
