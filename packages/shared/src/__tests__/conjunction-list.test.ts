import { describe, expect, it, vi } from 'vitest'
import { formatConjunctionList } from '../utils/conjunction-list'

const listCases = ['en', 'en-US', 'en-GB', 'pt-BR'].flatMap((locale) =>
  [[], ['One'], ['One', 'Two'], ['One', 'Two', 'Three'], ['One', 'Two', 'Three', 'Four'],
    ['$& {last}', '{first}']].map((values) => ({
    locale, values, expected: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values),
  })))

describe('shared conjunction lists', () => {
  it.each(listCases)('preserves native output in $locale for $values', ({ locale, values, expected }) => {
    expect(formatConjunctionList(values, locale)).toBe(expected)
  })

  it.each(listCases)('matches native output without ListFormat in $locale for $values', ({ locale, values, expected }) => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'ListFormat')!
    Object.defineProperty(Intl, 'ListFormat', { configurable: true, writable: true, value: undefined })
    try {
      expect(formatConjunctionList(values, locale)).toBe(expected)
    } finally {
      Object.defineProperty(Intl, 'ListFormat', descriptor)
    }
  })

  it('uses the native formatter for other web locales', () => {
    expect(formatConjunctionList(['Un', 'Deux', 'Trois'], 'fr'))
      .toBe(new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(['Un', 'Deux', 'Trois']))
  })

  it('rejects malformed locales with or without ListFormat', () => {
    expect(() => formatConjunctionList([], 'invalid_locale')).toThrow(RangeError)
    vi.spyOn(Intl, 'ListFormat').mockImplementation(() => { throw new Error('native failure') })
    try {
      expect(() => formatConjunctionList(['One'], 'en')).toThrow('native failure')
    } finally {
      vi.restoreAllMocks()
    }
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'ListFormat')!
    Object.defineProperty(Intl, 'ListFormat', { configurable: true, writable: true, value: undefined })
    try {
      expect(() => formatConjunctionList([], 'invalid_locale')).toThrow(RangeError)
    } finally {
      Object.defineProperty(Intl, 'ListFormat', descriptor)
    }
  })
})
