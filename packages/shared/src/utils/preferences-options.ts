import type { SupportedLocale } from '../types/profile'
import type { TimeFormat } from './time-format'

export interface LabeledOption<TValue extends string | number> {
  value: TValue
  label: string
}

export type PreferencesTranslationAdapter = (key: string) => string

export const LANGUAGE_OPTIONS: LabeledOption<SupportedLocale>[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português' },
]

export function buildWeekStartOptions(
  translate: PreferencesTranslationAdapter,
): LabeledOption<number>[] {
  return [
    { value: 1, label: translate('settings.weekStartDay.monday') },
    { value: 0, label: translate('settings.weekStartDay.sunday') },
  ]
}

export function buildTimeFormatOptions(
  translate: PreferencesTranslationAdapter,
): LabeledOption<TimeFormat>[] {
  return [
    { value: '12h', label: translate('settings.timeFormat.12h') },
    { value: '24h', label: translate('settings.timeFormat.24h') },
  ]
}
