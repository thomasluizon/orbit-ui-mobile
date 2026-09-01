import type { useTranslations } from 'next-intl'
import { LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { ThemeMode } from '@orbit/shared/types/profile'

interface PreferenceLabelInputs {
  selectedLanguage: string
  currentTheme: string
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: number; label: string }[]
}

export function derivePreferenceLabels(
  t: ReturnType<typeof useTranslations>,
  {
    selectedLanguage,
    currentTheme,
    weekStartDay,
    themeModeOptions,
    weekStartOptions,
  }: PreferenceLabelInputs,
) {
  return {
    languageLabel: LANGUAGE_OPTIONS.find((lang) => lang.value === selectedLanguage)
      ?.label,
    themeLabel: themeModeOptions.find((mode) => mode.value === currentTheme)?.label,
    weekStartLabel: weekStartOptions.find((option) => option.value === weekStartDay)
      ?.label,
  }
}
