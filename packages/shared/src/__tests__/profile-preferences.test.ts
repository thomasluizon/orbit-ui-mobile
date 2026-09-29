import { describe, expect, it } from 'vitest'
import { createMockProfile } from './factories'
import ptBR from '../i18n/pt-BR.json'
import en from '../i18n/en.json'
import { buildProfilePickerLabels, deriveProfileAstraFeatures, deriveProfilePreferenceValues } from '../utils/profile-preferences'

const translateWeekday = (key: 'dates.daysValue.monday' | 'dates.daysValue.sunday') =>
  ptBR.dates.daysValue[key.endsWith('monday') ? 'monday' : 'sunday']

it('keeps the drawn weekday value forms in both locales', () => {
  expect(Object.values(ptBR.dates.daysValue)).toEqual([
    'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo',
  ])
  expect(Object.values(en.dates.daysValue)).toEqual([
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ])
})

describe('deriveProfilePreferenceValues', () => {
  it('uses account and preference state for inline labels', () => {
    expect(deriveProfilePreferenceValues({
      profile: createMockProfile({ isTrialActive: true, hasProAccess: true, timeZone: 'America/Sao_Paulo', weekStartDay: 1 }),
      selectedLanguage: 'pt-BR',
      translate: translateWeekday,
    })).toMatchObject({
      planLabelKey: 'profile.subscription.trial',
      timeZone: 'America/Sao_Paulo',
      languageLabel: 'Português',
      weekStartLabel: 'segunda',
    })
  })

  it('handles free and Pro plans without a time zone', () => {
    const inputs = {
      selectedLanguage: 'en',
      translate: translateWeekday,
    }
    expect(deriveProfilePreferenceValues({ ...inputs, profile: undefined }).planLabelKey).toBe('profile.subscription.free')
    expect(deriveProfilePreferenceValues({ ...inputs, profile: createMockProfile({ hasProAccess: true, isTrialActive: false, timeZone: null }) })).toMatchObject({
      planLabelKey: 'profile.subscription.pro',
      timeZone: undefined,
    })
  })
})

describe('deriveProfileAstraFeatures', () => {
  it('keeps both Astra controls in order and gates them on the plan', () => {
    const onToggleProactive = () => undefined
    const onToggleSummary = () => undefined
    const settings = {
      proactiveAstraEnabled: true,
      aiSummaryEnabled: false,
      proactivePending: false,
      summaryPending: true,
      onToggleProactive,
      onToggleSummary,
    }
    const free = deriveProfileAstraFeatures(false, settings)
    expect(free.map((feature) => [feature.key, feature.labelKey, feature.locked])).toEqual([
      ['proactive', 'profile.proactiveAstra.title', true],
      ['summary', 'profile.aiSummary.title', true],
    ])
    expect(deriveProfileAstraFeatures(true, settings)).toMatchObject([
      { checked: true, pending: false, locked: false, onToggle: onToggleProactive },
      { checked: false, pending: true, locked: false, onToggle: onToggleSummary },
    ])
  })
})

it('builds the inline picker labels from the active locale', () => {
  const labels = buildProfilePickerLabels((key) => `translated:${key}`)
  expect(labels.pickerTitles).toEqual({
    language: 'translated:profile.language.title',
    theme: 'translated:preferences.themeMode',
    timeZone: 'translated:profile.settingsRows.timezone',
    weekStart: 'translated:settings.weekStartDay.title',
    clock: 'translated:settings.clock.title',
  })
  expect(labels.clockFormatOptions).toEqual([
    { value: '24h', label: 'translated:settings.clock.hour24' },
    { value: '12h', label: 'translated:settings.clock.hour12' },
  ])
  expect(labels.weekStartOptions).toEqual([
    { value: 1, label: 'translated:settings.weekStartDay.monday' },
    { value: 0, label: 'translated:settings.weekStartDay.sunday' },
  ])
  expect(labels.themeModeOptions).toEqual([
    { value: 'dark', label: 'translated:preferences.themeModeDark' },
    { value: 'light', label: 'translated:preferences.themeModeLight' },
  ])
  expect(labels.pickerDescriptions.language).toBe('translated:profile.language.description')
  expect(labels.timeZoneShowMoreLabel).toBe('translated:profile.timezonePicker.showMore')
})
