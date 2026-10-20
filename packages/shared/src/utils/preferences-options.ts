import type { SupportedLocale } from '../types/profile'

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
): LabeledOption<0 | 1>[] {
  return [
    { value: 1, label: translate('settings.weekStartDay.monday') },
    { value: 0, label: translate('settings.weekStartDay.sunday') },
  ]
}

export function buildClockFormatOptions(
  translate: PreferencesTranslationAdapter,
): LabeledOption<'24h' | '12h'>[] {
  return [
    { value: '24h', label: translate('settings.clock.hour24') },
    { value: '12h', label: translate('settings.clock.hour12') },
  ]
}
