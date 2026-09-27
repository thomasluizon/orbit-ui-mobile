import { describe, it, expect } from 'vitest'
import { resolveActiveScheme } from '@/lib/resolve-active-scheme'

describe('resolveActiveScheme', () => {
  it('returns null before the profile loads', () => {
    expect(resolveActiveScheme(null)).toBeNull()
  })

  it('maps every stored profile value and null to orange', () => {
    for (const stored of ['purple', 'blue', 'green', 'rose', 'orange', 'cyan', null]) {
      expect(resolveActiveScheme({ colorScheme: stored, hasProAccess: true })).toBe('orange')
      expect(resolveActiveScheme({ colorScheme: stored, hasProAccess: false })).toBe('orange')
    }
  })
})
