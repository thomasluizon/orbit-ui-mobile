import { describe, expect, it } from 'vitest'
import { habitInitial } from '../utils/habit-initial'

describe('habitInitial', () => {
  it.each([
    ['walk', 'W'],
    ['  walk', 'W'],
    ['e\u0301tude', 'E\u0301'],
    ['  👩‍🚀 mission', '👩‍🚀'],
    ['', ''],
  ])('returns the first grapheme of %s', (title, initial) => {
    expect(habitInitial(title)).toBe(initial)
  })
})
