import { describe, expect, it, vi } from 'vitest'
import { buildPreferencePickerModel, type PreferencePickerValues } from '../utils/preference-picker'

function values(): PreferencePickerValues {
  return {
    activePicker: 'clock',
    ready: true,
    selectedLanguage: 'en',
    currentTheme: 'dark',
    timeZone: 'UTC',
    weekStartDay: 1,
    uses24HourClock: true,
    themeModeOptions: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }],
    weekStartOptions: [{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }],
    clockFormatOptions: [{ value: '24h', label: '24 hour' }, { value: '12h', label: '12 hour' }],
    pickerTitles: { language: 'Language', theme: 'Theme', timeZone: 'Time zone', weekStart: 'Week', clock: 'Clock' },
    onLanguageChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onTimeZoneChange: vi.fn(),
    onWeekStartChange: vi.fn(),
    onClockFormatChange: vi.fn(),
  }
}

describe('preference picker model', () => {
  it('selects the resolved clock and commits its boolean wire value', () => {
    const input = values()
    const model = buildPreferencePickerModel(input)
    expect(model).toMatchObject({ kind: 'options', label: 'Clock', selected: '24h', options: input.clockFormatOptions })
    model.onCommit('12h')
    expect(input.onClockFormatChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(buildPreferencePickerModel({ ...input, uses24HourClock: undefined }).selected).toBe('12h')
  })

  it('keeps unresolved profile choices empty and routes other commits', () => {
    const input = values()
    const language = buildPreferencePickerModel({ ...input, activePicker: 'language', ready: false })
    expect(language.selected).toBeNull()
    language.onCommit('pt-BR')
    expect(input.onLanguageChange).toHaveBeenCalledExactlyOnceWith('pt-BR')

    const theme = buildPreferencePickerModel({ ...input, activePicker: 'theme' })
    theme.onCommit('light')
    expect(input.onThemeModeChange).toHaveBeenCalledExactlyOnceWith('light')

    const week = buildPreferencePickerModel({ ...input, activePicker: 'weekStart' })
    if (week.kind !== 'options') throw new Error('Expected week options')
    week.onCommit(0)
    expect(input.onWeekStartChange).toHaveBeenCalledExactlyOnceWith(0)

    const timeZone = buildPreferencePickerModel({ ...input, activePicker: 'timeZone' })
    timeZone.onCommit('America/Sao_Paulo')
    expect(input.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('America/Sao_Paulo')
  })
})
