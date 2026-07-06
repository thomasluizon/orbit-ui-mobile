import { describe, it, expect } from 'vitest'
import { resolveActiveScheme } from '@/lib/resolve-active-scheme'

describe('resolveActiveScheme', () => {
  it('returns null when there is neither a profile nor a draft scheme', () => {
    expect(resolveActiveScheme(null, null)).toBeNull()
  })

  it('follows the pre-auth onboarding draft when there is no profile', () => {
    expect(resolveActiveScheme(null, 'blue')).toBe('blue')
  })

  it('grants any draft scheme pre-auth (onboarding has Pro access)', () => {
    expect(resolveActiveScheme(null, 'cyan')).toBe('cyan')
  })

  it('prefers the authenticated profile over the draft', () => {
    expect(
      resolveActiveScheme({ colorScheme: 'green', hasProAccess: true }, 'blue'),
    ).toBe('green')
  })

  it('gates a Pro-only scheme for a free profile back to the default', () => {
    expect(
      resolveActiveScheme({ colorScheme: 'blue', hasProAccess: false }, null),
    ).not.toBe('blue')
  })
})
