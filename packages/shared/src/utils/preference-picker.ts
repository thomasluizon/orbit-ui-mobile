import type { SupportedLocale, ThemeMode } from '../types/profile'
import { resolveHourCycle } from './locale-format'
import { LANGUAGE_OPTIONS, type LabeledOption } from './preferences-options'

export type PreferencePicker = 'language' | 'theme' | 'timeZone' | 'weekStart' | 'clock'

export interface PreferencePickerValues {
  activePicker: PreferencePicker
  ready: boolean
  selectedLanguage: SupportedLocale
  currentTheme: ThemeMode
  timeZone?: string | null
  weekStartDay?: number
  uses24HourClock?: boolean
  themeModeOptions: LabeledOption<ThemeMode>[]
  weekStartOptions: LabeledOption<0 | 1>[]
  clockFormatOptions: LabeledOption<'24h' | '12h'>[]
  pickerTitles: Record<PreferencePicker, string>
  onLanguageChange: (locale: SupportedLocale) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onTimeZoneChange: (timeZone: string) => void
  onWeekStartChange: (day: 0 | 1) => void
  onClockFormatChange: (uses24HourClock: boolean) => void
}

export type PreferencePickerModel =
  | { kind: 'timeZone'; selected: string | null; onCommit: (value: string) => void }
  | {
    kind: 'options'
    label: string
    options: readonly LabeledOption<string | number>[]
    selected: string | number | null
    onCommit: (value: string | number) => void
  }

export function buildPreferencePickerModel(values: PreferencePickerValues): PreferencePickerModel {
  const { activePicker, ready, selectedLanguage, currentTheme, timeZone, weekStartDay,
    uses24HourClock, themeModeOptions, weekStartOptions, clockFormatOptions, pickerTitles } = values

  switch (activePicker) {
    case 'language':
      return {
        kind: 'options', label: pickerTitles.language, options: LANGUAGE_OPTIONS,
        selected: ready ? selectedLanguage : null,
        onCommit: (value) => {
          if (value === 'en' || value === 'pt-BR') values.onLanguageChange(value)
        },
      }
    case 'theme':
      return {
        kind: 'options', label: pickerTitles.theme, options: themeModeOptions,
        selected: ready ? currentTheme : null,
        onCommit: (value) => {
          if (value === 'dark' || value === 'light') values.onThemeModeChange(value)
        },
      }
    case 'timeZone':
      return { kind: 'timeZone', selected: ready ? timeZone ?? null : null, onCommit: values.onTimeZoneChange }
    case 'clock':
      return {
        kind: 'options', label: pickerTitles.clock, options: clockFormatOptions,
        selected: resolveHourCycle(uses24HourClock, selectedLanguage) === 'h23' ? '24h' : '12h',
        onCommit: (value) => {
          if (value === '24h' || value === '12h') values.onClockFormatChange(value === '24h')
        },
      }
    case 'weekStart':
      return {
        kind: 'options', label: pickerTitles.weekStart, options: weekStartOptions,
        selected: ready && (weekStartDay === 0 || weekStartDay === 1) ? weekStartDay : null,
        onCommit: (value) => {
          if (value === 0 || value === 1) values.onWeekStartChange(value)
        },
      }
  }
}
