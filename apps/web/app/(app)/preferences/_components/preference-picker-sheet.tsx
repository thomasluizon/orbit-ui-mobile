'use client'

import { useTranslations } from 'next-intl'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { Sheet } from '@/components/ui/sheet'
import { RadioRow } from '@/components/ui/select-check'
import { PillButton } from '@/components/ui/pill-button'

export type PreferencePicker = 'language' | 'theme' | 'scheme' | 'weekStart'

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

interface PreferencePickerSheetProps {
  activePicker: PreferencePicker | null
  mounted: boolean
  selectedLanguage: string
  currentTheme: ThemeMode
  currentScheme: ColorScheme
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: 0 | 1; label: string }[]
  pickerTitles: Record<PreferencePicker, string>
  pickerDescriptions: Partial<Record<PreferencePicker, string>>
  onClose: () => void
  onLanguageChange: (locale: SupportedLocale) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onSchemeChange: (scheme: ColorScheme) => void
  onWeekStartChange: (day: 0 | 1) => void
}

export function PreferencePickerSheet({
  activePicker,
  mounted,
  selectedLanguage,
  currentTheme,
  currentScheme,
  weekStartDay,
  themeModeOptions,
  weekStartOptions,
  pickerTitles,
  pickerDescriptions,
  onClose,
  onLanguageChange,
  onThemeModeChange,
  onSchemeChange,
  onWeekStartChange,
}: Readonly<PreferencePickerSheetProps>) {
  const t = useTranslations()
  if (activePicker === null) return null

  return (
    <Sheet
      open
      onClose={onClose}
      title={pickerTitles[activePicker]}
      actions={
        activePicker === 'scheme' ? (
          <PillButton
            variant="secondary"

            onClick={onClose}

          >
            {t('common.done')}
          </PillButton>
        ) : undefined
      }
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
            onClick={() => {
              onClose()
              onLanguageChange(lang.value)
            }}
          />
        ))}
      {activePicker === 'theme' &&
        themeModeOptions.map((mode, index) => (
          <RadioRow
            key={mode.value}
            label={mode.label}
            selected={mounted && currentTheme === mode.value}
            divider={index < themeModeOptions.length - 1}
            onClick={() => {
              onClose()
              onThemeModeChange(mode.value)
            }}
          />
        ))}
      {activePicker === 'scheme' &&
        colorSchemeOptions.map((option, index) => (
          <RadioRow
            key={option.value}
            label={t(
              `preferences.color${capitalize(option.value)}`,
            )}
            selected={mounted && currentScheme === option.value}
            dot={option.color}
            divider={index < colorSchemeOptions.length - 1}
            onClick={() => {
              onSchemeChange(option.value)
            }}
          />
        ))}
      {activePicker === 'weekStart' &&
        weekStartOptions.map((option, index) => (
          <RadioRow
            key={option.value}
            label={option.label}
            selected={mounted && weekStartDay === option.value}
            divider={index < weekStartOptions.length - 1}
            onClick={() => {
              onClose()
              onWeekStartChange(option.value)
            }}
          />
        ))}
    </Sheet>
  )
}
