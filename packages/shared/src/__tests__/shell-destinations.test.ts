import { describe, expect, it, vi } from 'vitest'
import { SHELL_DESTINATION_IDS } from '../utils/destination-icons'
import {
  SHELL_DESTINATION_PATHS,
  SHELL_ROOT_PATHS,
  resolveShellChrome,
  resolveShellDestination,
  resolveTabSwitchDirection,
} from '../utils/shell-destinations'

describe('resolveShellDestination', () => {
  it.each([
    ['/', 'hoje'],
    ['/habits/123', 'hoje'],
    ['/calendar', 'calendario'],
    ['/goals/123', 'progresso'],
    ['/wrapped', 'progresso'],
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

  it('shows the composer only on habit detail', () => {
    for (const route of ['/habits/h1', '/habits/habit-1']) {
      expect(resolveShellChrome(route).composer).toBe(true)
    }
    for (const route of ['/', '/habits/new', '/habits/habit-1/edit', '/calendar', '/progress', '/profile', '/search', '/about', '/support', '/notifications', '/upgrade', '/preferences', '/advanced', '/ai-settings']) {
      expect(resolveShellChrome(route).composer).toBe(false)
    }
  })
})

describe('shell destination paths', () => {
  it.each(SHELL_DESTINATION_IDS)('maps %s to a root path that resolves back to it', (id) => {
    expect(resolveShellDestination(SHELL_DESTINATION_PATHS[id])).toBe(id)
  })

  it('lists the root paths in the order the tab bars render', () => {
    expect(SHELL_ROOT_PATHS).toEqual(['/', '/calendar', '/progress', '/profile'])
  })
})

describe('resolveTabSwitchDirection', () => {
  it.each([
    ['/', '/calendar', 1],
    ['/calendar', '/profile', 1],
    ['/profile', '/progress', -1],
    ['/progress', '/', -1],
  ] as const)('orders the primary tabs from %s to %s', (from, to, direction) => {
    expect(resolveTabSwitchDirection(from, to)).toBe(direction)
  })

  it.each([
    ['/', '/'],
    ['/', '/habits/h1'],
    ['/profile/account', '/profile'],
  ])('is not a tab switch from %s to %s', (from, to) => {
    expect(resolveTabSwitchDirection(from, to)).toBeNull()
  })

  it('follows a new tab bar order', async () => {
    vi.resetModules()
    vi.doMock('../utils/destination-icons', () => ({ SHELL_DESTINATION_IDS: ['perfil', 'progresso', 'calendario', 'hoje'] }))
    try {
      const reordered = await import('../utils/shell-destinations')
      expect(reordered.SHELL_ROOT_PATHS).toEqual(['/profile', '/progress', '/calendar', '/'])
      expect(reordered.resolveTabSwitchDirection('/', '/calendar')).toBe(-1)
    } finally {
      vi.doUnmock('../utils/destination-icons')
      vi.resetModules()
    }
  })
})
