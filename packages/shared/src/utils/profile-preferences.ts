import type { Profile, ThemeMode } from '../types/profile'
import { buildWeekStartOptions, LANGUAGE_OPTIONS } from './preferences-options'

interface ProfilePreferenceInputs {
  profile: Pick<Profile, 'isTrialActive' | 'hasProAccess' | 'timeZone' | 'weekStartDay'> | undefined
  selectedLanguage: string
  weekStartOptions: ReadonlyArray<{ value: number; label: string }>
}

interface ProfilePreferenceValues {
  planLabelKey: 'profile.subscription.trial' | 'profile.subscription.pro' | 'profile.subscription.free'
  timeZone: string | undefined
  languageLabel: string | undefined
  weekStartLabel: string | undefined
}

export function deriveProfilePreferenceValues({
  profile,
  selectedLanguage,
  weekStartOptions,
}: ProfilePreferenceInputs): ProfilePreferenceValues {
  return {
    planLabelKey: profile?.isTrialActive
      ? 'profile.subscription.trial'
      : profile?.hasProAccess
        ? 'profile.subscription.pro'
        : 'profile.subscription.free',
    timeZone: profile?.timeZone ?? undefined,
    languageLabel: LANGUAGE_OPTIONS.find((language) => language.value === selectedLanguage)?.label,
    weekStartLabel: weekStartOptions.find((option) => option.value === profile?.weekStartDay)?.label,
  }
}

interface ProfileAstraSettings {
  proactiveAstraEnabled: boolean
  aiSummaryEnabled: boolean
  proactivePending: boolean
  summaryPending: boolean
  onToggleProactive: () => void
  onToggleSummary: () => void
}

interface ProfileAstraFeature {
  key: 'proactive' | 'summary'
  labelKey: 'profile.proactiveAstra.title' | 'profile.aiSummary.title'
  checked: boolean
  pending: boolean
  onToggle: () => void
  locked: boolean
}

export function deriveProfileAstraFeatures(hasProAccess: boolean, settings: ProfileAstraSettings): ProfileAstraFeature[] {
  return [
    { key: 'proactive', labelKey: 'profile.proactiveAstra.title', checked: settings.proactiveAstraEnabled, pending: settings.proactivePending, onToggle: settings.onToggleProactive, locked: !hasProAccess },
    { key: 'summary', labelKey: 'profile.aiSummary.title', checked: settings.aiSummaryEnabled, pending: settings.summaryPending, onToggle: settings.onToggleSummary, locked: !hasProAccess },
  ]
}

interface ProfilePickerLabels {
  weekStartOptions: { value: 0 | 1; label: string }[]
  themeModeOptions: { value: ThemeMode; label: string }[]
  pickerTitles: Record<'language' | 'theme' | 'timeZone' | 'weekStart', string>
  pickerDescriptions: Partial<Record<'language' | 'weekStart', string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
}

export function buildProfilePickerLabels(translate: (key: string) => string): ProfilePickerLabels {
  return {
    weekStartOptions: buildWeekStartOptions(translate),
    themeModeOptions: [
      { value: 'dark', label: translate('preferences.themeModeDark') },
      { value: 'light', label: translate('preferences.themeModeLight') },
    ],
    pickerTitles: {
      language: translate('profile.language.title'),
      theme: translate('preferences.themeMode'),
      timeZone: translate('profile.settingsRows.timezone'),
      weekStart: translate('settings.weekStartDay.title'),
    },
    pickerDescriptions: {
      language: translate('profile.language.description'),
      weekStart: translate('settings.weekStartDay.description'),
    },
    timeZoneSearchLabel: translate('profile.timezonePicker.search'),
    timeZoneNoResultsLabel: translate('profile.timezonePicker.noResults'),
    timeZoneShowMoreLabel: translate('profile.timezonePicker.showMore'),
  }
}
