import type { Profile } from '../types/profile'
import { buildClockFormatOptions, buildWeekStartOptions, LANGUAGE_OPTIONS } from './preferences-options'

interface ProfilePreferenceInputs {
  profile: Pick<Profile, 'isTrialActive' | 'hasProAccess' | 'timeZone' | 'weekStartDay'> | undefined
  selectedLanguage: string
  translate: (key: 'dates.daysValue.monday' | 'dates.daysValue.sunday') => string
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
  translate,
}: ProfilePreferenceInputs): ProfilePreferenceValues {
  return {
    planLabelKey: profile?.isTrialActive
      ? 'profile.subscription.trial'
      : profile?.hasProAccess
        ? 'profile.subscription.pro'
        : 'profile.subscription.free',
    timeZone: profile?.timeZone ?? undefined,
    languageLabel: LANGUAGE_OPTIONS.find((language) => language.value === selectedLanguage)?.label,
    weekStartLabel: profile?.weekStartDay === undefined
      ? undefined
      : translate(profile.weekStartDay === 1 ? 'dates.daysValue.monday' : 'dates.daysValue.sunday'),
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
  clockFormatOptions: { value: '24h' | '12h'; label: string }[]
  pickerTitles: Record<'language' | 'timeZone' | 'weekStart' | 'clock', string>
  pickerDescriptions: Partial<Record<'weekStart', string>>
  timeZoneSearchLabel: string
  timeZoneNoResultsLabel: string
  timeZoneShowMoreLabel: string
}

export function buildProfilePickerLabels(translate: (key: string) => string): ProfilePickerLabels {
  return {
    weekStartOptions: buildWeekStartOptions(translate),
    clockFormatOptions: buildClockFormatOptions(translate),
    pickerTitles: {
      language: translate('profile.language.question'),
      timeZone: translate('profile.timezonePicker.question'),
      weekStart: translate('settings.weekStartDay.question'),
      clock: translate('settings.clock.question'),
    },
    pickerDescriptions: {
      weekStart: translate('settings.weekStartDay.description'),
    },
    timeZoneSearchLabel: translate('profile.timezonePicker.search'),
    timeZoneNoResultsLabel: translate('profile.timezonePicker.noResults'),
    timeZoneShowMoreLabel: translate('profile.timezonePicker.showMore'),
  }
}

/** The time zone matches one page shows. More matches stay behind the show-more action. */
export const TIME_ZONE_PAGE_SIZE = 20

export interface GuidedTimeZoneInput {
  zones: readonly string[]
  /** The time zone the account holds. */
  selected: string | null | undefined
  /** The time zone of the device, when the device reports one. */
  deviceTimeZone: string | null
  /** The words the person typed in the search. */
  query: string
  visibleCount: number
}

export interface GuidedTimeZoneOptions {
  /** The quick options: the stored time zone, then the time zone of the device. */
  quick: string[]
  /** True once the person typed a search. Matches show only then. */
  searched: boolean
  /** The matches of the search on this page. */
  visible: string[]
  hasMore: boolean
}

/**
 * The time zone question in the guided pattern: the stored time zone and the time zone of the device are the
 * quick options, and every other time zone stays behind the search. A space in the search matches the
 * underscore of a time zone name, so "sao paulo" finds `America/Sao_Paulo`.
 */
export function buildGuidedTimeZoneOptions(input: GuidedTimeZoneInput): GuidedTimeZoneOptions {
  const device = input.deviceTimeZone && input.zones.includes(input.deviceTimeZone) ? input.deviceTimeZone : null
  const quick = [...new Set([input.selected, device].filter((zone): zone is string => Boolean(zone)))]
  const term = input.query.trim().toLocaleLowerCase().replaceAll(/\s+/g, '_')
  const matches = term ? input.zones.filter((zone) => zone.toLocaleLowerCase().includes(term)) : []
  return { quick, searched: term.length > 0, visible: matches.slice(0, input.visibleCount), hasMore: matches.length > input.visibleCount }
}

