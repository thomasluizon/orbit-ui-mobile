import { describe, expect, it } from 'vitest'
import {
  buildTimeFormatOptions,
  buildWeekStartOptions,
  LANGUAGE_OPTIONS,
} from '../utils/preferences-options'

describe('preferences options', () => {
  it('keeps language options stable', () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { value: 'en', label: 'English' },
      { value: 'pt-BR', label: 'Português' },
    ])
  })

  it('builds localized week start options', () => {
    const translate = (key: string) => `t:${key}`

    expect(buildWeekStartOptions(translate)).toEqual([
      { value: 1, label: 't:settings.weekStartDay.monday' },
      { value: 0, label: 't:settings.weekStartDay.sunday' },
    ])
  })

  it('builds localized time format options', () => {
    const translate = (key: string) => `t:${key}`

    expect(buildTimeFormatOptions(translate)).toEqual([
      { value: '12h', label: 't:settings.timeFormat.12h' },
      { value: '24h', label: 't:settings.timeFormat.24h' },
    ])
  })
})
