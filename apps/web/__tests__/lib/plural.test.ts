import { describe, it, expect } from 'vitest'
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
      // Returns original text (no matching form count)
      expect(plural('a | b | c | d', 1)).toBe('a | b | c | d')
    })
  })
})
