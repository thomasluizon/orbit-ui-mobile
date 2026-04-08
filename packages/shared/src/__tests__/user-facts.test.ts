import { describe, expect, it } from 'vitest'
import { normalizeUserFactCategory, USER_FACTS_PER_PAGE } from '../utils/user-facts'

describe('user facts helpers', () => {
  it('uses the shared page size', () => {
    expect(USER_FACTS_PER_PAGE).toBe(5)
  })

  it('normalizes known categories', () => {
    expect(normalizeUserFactCategory('Preference')).toBe('preference')
    expect(normalizeUserFactCategory('routine')).toBe('routine')
    expect(normalizeUserFactCategory('context')).toBe('context')
  })

  it('falls back to default for unknown categories', () => {
    expect(normalizeUserFactCategory('something-else')).toBe('default')
    expect(normalizeUserFactCategory(null)).toBe('default')
  })
})
