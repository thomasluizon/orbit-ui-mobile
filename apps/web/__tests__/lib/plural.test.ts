import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { plural } from '@/lib/plural'

describe('plural', () => {
  describe('two-form strings (singular | plural)', () => {
    it('returns singular when count is 1', () => {
      expect(plural('day | days', 1)).toBe('day')
    })

    it('returns plural when count is 0', () => {
      expect(plural('day | days', 0)).toBe('days')
    })

    it('returns plural when count is greater than 1', () => {
      expect(plural('day | days', 5)).toBe('days')
    })

    it('returns plural for negative counts', () => {
      expect(plural('item | items', -1)).toBe('items')
    })
  })

  describe('three-form strings (zero | singular | plural)', () => {
    it('returns zero form when count is 0', () => {
      expect(plural('no items | one item | many items', 0)).toBe('no items')
    })

    it('returns singular form when count is 1', () => {
      expect(plural('no items | one item | many items', 1)).toBe('one item')
    })

    it('returns plural form when count is greater than 1', () => {
      expect(plural('no items | one item | many items', 2)).toBe('many items')
    })

    it('returns plural form for large counts', () => {
      expect(plural('no items | one item | many items', 100)).toBe('many items')
    })
  })

  describe('non-plural strings', () => {
    it('returns original text when no pipe separator', () => {
      expect(plural('hello world', 1)).toBe('hello world')
    })

    it('returns original text for empty string', () => {
      expect(plural('', 0)).toBe('')
    })

    it('returns original text when pipe has no spaces around it', () => {
      expect(plural('a|b', 1)).toBe('a|b')
    })
  })

  describe('edge cases', () => {
    it('trims whitespace from forms', () => {
      expect(plural('  day  |  days  ', 1)).toBe('day')
      expect(plural('  day  |  days  ', 2)).toBe('days')
    })

    it('handles strings with more than 3 pipe-separated forms', () => {
      expect(plural('a | b | c | d', 1)).toBe('a | b | c | d')
    })
  })

  it.each([
    { locale: 'en', messages: en, count: 0, expected: 'Streak progress is calculated automatically, so it cannot be edited here.' },
    { locale: 'en', messages: en, count: 1, expected: 'It comes from the current streak of the linked habit, so it cannot be edited here.' },
    { locale: 'en', messages: en, count: 3, expected: 'It comes from the smallest current streak among the 3 linked habits, so it cannot be edited here.' },
    { locale: 'pt-BR', messages: ptBR, count: 0, expected: 'O progresso da sequência é calculado automaticamente, então não pode ser editado aqui.' },
    { locale: 'pt-BR', messages: ptBR, count: 1, expected: 'Vem da sequência atual do hábito ligado a esta meta, então não pode ser editado aqui.' },
    { locale: 'pt-BR', messages: ptBR, count: 3, expected: 'Vem da menor sequência atual entre os 3 hábitos ligados a esta meta, então não pode ser editado aqui.' },
  ] as const)('renders derived streak copy in $locale at count $count', ({ locale, messages, count, expected }) => {
    const t = createTranslator({ locale, messages })

    expect(plural(t('goals.detail.derivedStreak', { count }), count)).toBe(expected)
  })
})
