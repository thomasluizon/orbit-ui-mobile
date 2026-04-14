import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EMOJI_RECENTS_LIMIT,
  addRecent,
  parseRecents,
  removeRecent,
  stringifyRecents,
} from '../utils/emoji-recents'

describe('emoji-recents', () => {
  describe('parseRecents', () => {
    it('returns empty list for null/undefined/empty input', () => {
      expect(parseRecents(null)).toEqual([])
      expect(parseRecents(undefined)).toEqual([])
      expect(parseRecents('')).toEqual([])
    })

    it('returns empty list for invalid JSON', () => {
      expect(parseRecents('not json')).toEqual([])
    })

    it('returns empty list for non-array payload', () => {
      expect(parseRecents('{"foo":1}')).toEqual([])
    })

    it('parses a valid array', () => {
      expect(parseRecents('["\u{1F3C3}","\u{1F4DA}"]')).toEqual(['\u{1F3C3}', '\u{1F4DA}'])
    })

    it('filters out non-string entries', () => {
      expect(parseRecents('["\u{1F3C3}",123,null,"\u{1F4DA}"]')).toEqual([
        '\u{1F3C3}',
        '\u{1F4DA}',
      ])
    })

    it('deduplicates while preserving first-seen order', () => {
      expect(parseRecents('["\u{1F3C3}","\u{1F4DA}","\u{1F3C3}"]')).toEqual([
        '\u{1F3C3}',
        '\u{1F4DA}',
      ])
    })

    it('trims whitespace and ignores empties', () => {
      expect(parseRecents('["  \u{1F3C3}  ","","   "]')).toEqual(['\u{1F3C3}'])
    })
  })

  describe('addRecent', () => {
    it('adds a new emoji to the front of an empty list', () => {
      expect(addRecent([], '\u{1F3C3}')).toEqual(['\u{1F3C3}'])
    })

    it('moves an existing emoji to the front', () => {
      expect(addRecent(['\u{1F4DA}', '\u{1F3C3}', '\u{1F331}'], '\u{1F3C3}')).toEqual([
        '\u{1F3C3}',
        '\u{1F4DA}',
        '\u{1F331}',
      ])
    })

    it('respects the limit by trimming the tail', () => {
      const existing = Array.from({ length: DEFAULT_EMOJI_RECENTS_LIMIT }, (_, i) => `e${i}`)
      const result = addRecent(existing, '\u{1F3C3}')
      expect(result).toHaveLength(DEFAULT_EMOJI_RECENTS_LIMIT)
      expect(result[0]).toBe('\u{1F3C3}')
      expect(result[result.length - 1]).toBe(`e${DEFAULT_EMOJI_RECENTS_LIMIT - 2}`)
    })

    it('accepts a custom limit', () => {
      expect(addRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
    })

    it('ignores empty/whitespace emoji', () => {
      expect(addRecent(['a'], '')).toEqual(['a'])
      expect(addRecent(['a'], '   ')).toEqual(['a'])
    })

    it('trims the emoji before adding', () => {
      expect(addRecent([], '  \u{1F3C3}  ')).toEqual(['\u{1F3C3}'])
    })
  })

  describe('removeRecent', () => {
    it('removes an existing emoji', () => {
      expect(removeRecent(['\u{1F3C3}', '\u{1F4DA}'], '\u{1F3C3}')).toEqual(['\u{1F4DA}'])
    })

    it('returns the same reference when emoji is absent', () => {
      const list = ['\u{1F3C3}']
      expect(removeRecent(list, '\u{1F4DA}')).toBe(list)
    })

    it('ignores empty/whitespace emoji', () => {
      const list = ['a']
      expect(removeRecent(list, '')).toBe(list)
    })
  })

  describe('stringifyRecents', () => {
    it('serializes to JSON', () => {
      expect(stringifyRecents(['\u{1F3C3}', '\u{1F4DA}'])).toBe(
        JSON.stringify(['\u{1F3C3}', '\u{1F4DA}']),
      )
    })
  })
})
