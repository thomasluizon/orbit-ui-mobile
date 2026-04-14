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
): LabeledOption<number>[] {
  return [
    { value: 1, label: translate('settings.weekStartDay.monday') },
    { value: 0, label: translate('settings.weekStartDay.sunday') },
  ]
}
