import { describe, expect, it } from 'vitest'
import { highlightText } from '../utils/highlight-text'

describe('highlightText', () => {
  it('returns a single non-match segment when the query is empty', () => {
    expect(highlightText('Drink water', '')).toEqual([
      { text: 'Drink water', isMatch: false },
    ])
  })

  it('returns a single empty segment when the text is empty', () => {
    expect(highlightText('', 'water')).toEqual([{ text: '', isMatch: false }])
  })

  it('treats a whitespace-only query as no match', () => {
    expect(highlightText('Drink water', '   ')).toEqual([
      { text: 'Drink water', isMatch: false },
    ])
  })

  it('marks a case-insensitive match while preserving original casing', () => {
    expect(highlightText('Drink Water', 'water')).toEqual([
      { text: 'Drink ', isMatch: false },
      { text: 'Water', isMatch: true },
    ])
  })

  it('marks every occurrence of a repeated match', () => {
    expect(highlightText('tea or tea', 'tea')).toEqual([
      { text: 'tea', isMatch: true },
      { text: ' or ', isMatch: false },
      { text: 'tea', isMatch: true },
    ])
  })

  it('keeps the trailing remainder after the last match', () => {
    expect(highlightText('water bottle', 'water')).toEqual([
      { text: 'water', isMatch: true },
      { text: ' bottle', isMatch: false },
    ])
  })

  it('returns one non-match segment when nothing matches', () => {
    expect(highlightText('Drink water', 'run')).toEqual([
      { text: 'Drink water', isMatch: false },
    ])
  })
})
