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
    ['', ''],
  ])('returns the first grapheme of %s', (title, initial) => {
    expect(habitInitial(title)).toBe(initial)
  })
})
