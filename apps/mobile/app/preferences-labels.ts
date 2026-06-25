import type { useTranslation } from 'react-i18next'
import { colorSchemeOptions } from '@orbit/shared/theme'
import { LANGUAGE_OPTIONS } from '@orbit/shared/utils'
import type { ThemeMode } from '@orbit/shared/types/profile'

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

interface PreferenceLabelInputs {
  selectedLanguage: string
  currentTheme: string
  currentScheme: string
  weekStartDay?: number
  themeModeOptions: { value: ThemeMode; label: string }[]
  weekStartOptions: { value: number; label: string }[]
}

export function derivePreferenceLabels(
  t: ReturnType<typeof useTranslation>['t'],
  {
    selectedLanguage,
    currentTheme,
    currentScheme,
    weekStartDay,
    themeModeOptions,
    weekStartOptions,
  }: PreferenceLabelInputs,
) {
  const schemeOption = colorSchemeOptions.find(
    (option) => option.value === currentScheme,
  )
  return {
    languageLabel: LANGUAGE_OPTIONS.find(
      (lang) => lang.value === selectedLanguage,
    )?.label,
    themeLabel: themeModeOptions.find((mode) => mode.value === currentTheme)
      ?.label,
    schemeOption,
    schemeLabel: schemeOption
      ? t(`preferences.color${capitalize(schemeOption.value)}`)
      : undefined,
    weekStartLabel: weekStartOptions.find(
      (option) => option.value === weekStartDay,
    )?.label,
  }
}
