import { describe, expect, it } from 'vitest'
import {
  buildWeekStartOptions,
  buildClockFormatOptions,
  LANGUAGE_OPTIONS,
} from '../utils/preferences-options'

describe('preferences options', () => {
  it('keeps language options stable', () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { value: 'en', label: 'English' },
      { value: 'pt-BR', label: 'Português' },
    ])
  })

  it('builds clock choices in display order', () => {
    expect(buildClockFormatOptions((key) => `t:${key}`)).toEqual([
      { value: '24h', label: 't:settings.clock.hour24' },
      { value: '12h', label: 't:settings.clock.hour12' },
    ])
  })

  it('builds localized week start options', () => {
    const translate = (key: string) => `t:${key}`

    expect(buildWeekStartOptions(translate)).toEqual([
      { value: 1, label: 't:settings.weekStartDay.monday' },
      { value: 0, label: 't:settings.weekStartDay.sunday' },
    ])
  })
})
