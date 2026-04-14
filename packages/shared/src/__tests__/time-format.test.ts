import { describe, expect, it } from 'vitest'
import {
  detectDefaultTimeFormat,
  formatLocaleTime,
  resolveSystemLocale,
} from '../utils/locale-format'

describe('locale-format utils', () => {
  it('formats time for English locale', () => {
    expect(formatLocaleTime('14:30', 'en')).toBe('2:30 PM')
  })

  it('formats time for Portuguese locale', () => {
    expect(formatLocaleTime('14:30', 'pt-BR')).toBe('14:30')
  })

  it('detects locale-specific default time formats', () => {
    expect(detectDefaultTimeFormat('en')).toBe('12h')
    expect(detectDefaultTimeFormat('pt-BR')).toBe('24h')
  })

  it('maps Portuguese system locales to pt-BR', () => {
    expect(resolveSystemLocale('pt-PT')).toBe('pt-BR')
    expect(resolveSystemLocale('en-US')).toBe('en')
  })
})
