import { describe, expect, it } from 'vitest'
import { createMockProfile } from './factories'
import ptBR from '../i18n/pt-BR.json'
import en from '../i18n/en.json'
import { buildGuidedTimeZoneOptions, buildProfilePickerLabels, deriveProfileOrbitFeatures, deriveProfilePreferenceValues, filterTimeZones, TIME_ZONE_PAGE_SIZE } from '../utils/profile-preferences'

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

describe('deriveProfileOrbitFeatures', () => {
  it('keeps both Orbit controls in order and gates them on the plan', () => {
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
    const free = deriveProfileOrbitFeatures(false, settings)
    expect(free.map((feature) => [feature.key, feature.labelKey, feature.locked])).toEqual([
      ['proactive', 'profile.proactiveOrbit.title', true],
      ['summary', 'profile.aiSummary.title', true],
    ])
    expect(deriveProfileOrbitFeatures(true, settings)).toMatchObject([
      { checked: true, pending: false, locked: false, onToggle: onToggleProactive },
      { checked: false, pending: true, locked: false, onToggle: onToggleSummary },
    ])
  })
})

it('builds the inline picker labels from the active locale', () => {
  const labels = buildProfilePickerLabels((key) => `translated:${key}`)
  expect(labels.pickerTitles).toEqual({
    language: 'translated:profile.language.question',
    timeZone: 'translated:profile.timezonePicker.question',
    weekStart: 'translated:settings.weekStartDay.question',
    clock: 'translated:settings.clock.question',
  })
  expect(labels.clockFormatOptions).toEqual([
    { value: '24h', label: 'translated:settings.clock.hour24' },
    { value: '12h', label: 'translated:settings.clock.hour12' },
  ])
  expect(labels.weekStartOptions).toEqual([
    { value: 1, label: 'translated:settings.weekStartDay.monday' },
    { value: 0, label: 'translated:settings.weekStartDay.sunday' },
  ])
  expect(labels.pickerDescriptions).toEqual({ weekStart: 'translated:settings.weekStartDay.description' })
  expect(labels.timeZoneShowMoreLabel).toBe('translated:profile.timezonePicker.showMore')
})

describe('filterTimeZones', () => {
  const zones = ['America/Sao_Paulo', 'America/Bogota', 'Europe/London']

  it('keeps every time zone with no words, and matches the folded words of the person', () => {
    expect(filterTimeZones(zones, '  ')).toEqual(zones)
    expect(filterTimeZones(zones, 'São Paulo')).toEqual(['America/Sao_Paulo'])
    expect(filterTimeZones(zones, 'BOGOTÁ')).toEqual(['America/Bogota'])
    expect(filterTimeZones(zones, 'europe/lon')).toEqual(['Europe/London'])
    expect(filterTimeZones(zones, 'zzz')).toEqual([])
  })
})

describe('buildGuidedTimeZoneOptions', () => {
  const zones = ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Europe/London', 'UTC', ...Array.from({ length: 30 }, (_, index) => `Asia/City_${index}`)]
  const base = { zones, selected: 'America/Sao_Paulo', deviceTimeZone: 'Europe/Lisbon', query: '', visibleCount: TIME_ZONE_PAGE_SIZE }

  it('offers the stored time zone and the time zone of the device as the quick options, with no match before a search', () => {
    expect(buildGuidedTimeZoneOptions(base)).toEqual({ quick: ['America/Sao_Paulo', 'Europe/Lisbon'], searched: false, visible: [], hasMore: false })
  })

  it('offers one quick option when the device is in the stored time zone, reports none or reports a name the list does not hold', () => {
    expect(buildGuidedTimeZoneOptions({ ...base, deviceTimeZone: 'America/Sao_Paulo' }).quick).toEqual(['America/Sao_Paulo'])
    expect(buildGuidedTimeZoneOptions({ ...base, deviceTimeZone: null }).quick).toEqual(['America/Sao_Paulo'])
    expect(buildGuidedTimeZoneOptions({ ...base, deviceTimeZone: 'Mars/Olympus' }).quick).toEqual(['America/Sao_Paulo'])
    expect(buildGuidedTimeZoneOptions({ ...base, selected: null }).quick).toEqual(['Europe/Lisbon'])
  })

  it('finds a time zone by the words of the person, in any case and with a space for the underscore', () => {
    expect(buildGuidedTimeZoneOptions({ ...base, query: ' LONDON ' })).toMatchObject({ searched: true, visible: ['Europe/London'], hasMore: false })
    expect(buildGuidedTimeZoneOptions({ ...base, query: 'new york' }).visible).toEqual(['America/New_York'])
  })

  it.each(['São Paulo', 'são paulo', 'SÃO PAULO', 'Sao Paulo'])('finds a time zone by a name typed with or without its accents: %s', (query) => {
    expect(buildGuidedTimeZoneOptions({ ...base, query }).visible).toEqual(['America/Sao_Paulo'])
  })

  it('finds Bogotá, Belém, Cuiabá and Maceió in the full list', () => {
    const everyZone = ['America/Bogota', 'America/Belem', 'America/Cuiaba', 'America/Maceio', 'America/Sao_Paulo']
    for (const [query, zone] of [['Bogotá', 'America/Bogota'], ['Belém', 'America/Belem'], ['Cuiabá', 'America/Cuiaba'], ['Maceió', 'America/Maceio']] as const) {
      expect(buildGuidedTimeZoneOptions({ ...base, zones: everyZone, query }).visible).toEqual([zone])
    }
  })

  it('states a search with no match, and pages a search with many matches', () => {
    expect(buildGuidedTimeZoneOptions({ ...base, query: 'zzz' })).toMatchObject({ searched: true, visible: [], hasMore: false })
    const firstPage = buildGuidedTimeZoneOptions({ ...base, query: 'asia' })
    expect(firstPage.visible).toHaveLength(TIME_ZONE_PAGE_SIZE)
    expect(firstPage.hasMore).toBe(true)
    const secondPage = buildGuidedTimeZoneOptions({ ...base, query: 'asia', visibleCount: TIME_ZONE_PAGE_SIZE * 2 })
    expect(secondPage.visible).toHaveLength(30)
    expect(secondPage.hasMore).toBe(false)
  })
})

