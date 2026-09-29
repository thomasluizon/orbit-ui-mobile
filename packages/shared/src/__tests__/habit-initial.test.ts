import { describe, expect, it } from 'vitest'
import { habitInitial } from '../utils/habit-initial'

describe('habitInitial', () => {
  it.each([
    ['walk', 'W'],
    ['  walk', 'W'],
    ['e\u0301tude', 'E\u0301'],
    ['  👩‍🚀 mission', '👩‍🚀'],
    ['🇧🇷 Brasil', '🇧🇷'],
    ['👍🏽 Good', '👍🏽'],
    ['कि पाठ', 'कि'],
    ['क्ष अभ्यास', 'क्ष'],
    ['क्‍षब अभ्यास', 'क्‍ष'],
    ['กิ วิ่ง', 'กิ'],
    ['한글 읽기', '한'],
    ['a‍b habit', 'A‍'],
    ['🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} route', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
    ['ｶﾞ レッスン', 'ｶﾞ'],
    ['\u06001 habit', '\u06001'],
    ['a\u200cb habit', 'A\u200c'],
    ['क्A habit', 'क्'],
    ['', ''],
  ])('returns the first grapheme of %s', (title, initial) => {
    expect(habitInitial(title)).toBe(initial)
  })
})
