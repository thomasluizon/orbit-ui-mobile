import { describe, expect, it, vi } from 'vitest'
import { resolveShellChrome, resolveShellDestination } from '../utils/shell-destinations'

describe('resolveShellDestination', () => {
  it.each([
    ['/', 'hoje'],
    ['/habits/123', 'hoje'],
    ['/calendar', 'calendario'],
    ['/calendar-sync', 'calendario'],
    ['/goals/123', 'progresso'],
    ['/wrapped', 'progresso'],
    ['/preferences', 'perfil'],
    ['/advanced', 'perfil'],
    ['/profile/security', 'perfil'],
    ['/notifications', 'hoje'],
    ['/account/billing', 'perfil'],
    ['/upgrade', 'perfil'],
  ] as const)('maps %s to %s', (pathname, destination) => {
    expect(resolveShellDestination(pathname)).toBe(destination)
  })

  it('leaves navigation-free and unknown routes without a selected destination', () => {
    expect(resolveShellDestination('/streak')).toBeNull()
    expect(resolveShellDestination('/unknown')).toBeNull()
    expect(resolveShellDestination('/retrospective')).toBeNull()
    expect(resolveShellDestination('/calendarized')).toBeNull()
  })

  it('normalizes trailing slashes without a regular expression', () => {
    const replace = vi.spyOn(String.prototype, 'replace')
    try {
      const results = [
        resolveShellDestination('/'),
        resolveShellDestination('/calendar/'),
        resolveShellDestination('//'),
        resolveShellDestination('/calendar'),
        resolveShellDestination('/'.repeat(10_000) + 'unknown'),
      ]
      const usesRegularExpression = replace.mock.calls.some(([pattern]) => pattern instanceof RegExp)
      expect(results).toEqual(['hoje', 'calendario', null, 'calendario', null])
      expect(usesRegularExpression).toBe(false)
    } finally {
      replace.mockRestore()
    }
  })
})

describe('resolveShellChrome', () => {
  it('keeps the last destination for search and falls back to Hoje', () => {
    expect(resolveShellChrome('/search', 'calendario').activeId).toBe('calendario')
    expect(resolveShellChrome('/search').activeId).toBe('hoje')
    expect(resolveShellChrome('/upgrade').activeId).toBe('perfil')
  })

  it('shows the composer only on destination roots and habit detail', () => {
    for (const route of ['/', '/calendar', '/progress', '/profile', '/habits/h1']) {
      expect(resolveShellChrome(route).composer).toBe(true)
    }
    for (const route of ['/search', '/about', '/support', '/notifications', '/upgrade', '/preferences', '/advanced', '/ai-settings', '/calendar-sync']) {
      expect(resolveShellChrome(route).composer).toBe(false)
    }
  })
})
