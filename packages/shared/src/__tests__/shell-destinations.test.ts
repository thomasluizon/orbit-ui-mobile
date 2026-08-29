import { describe, expect, it } from 'vitest'
import {
  isPrimaryShellDestination,
  resolveShellDestination,
} from '../utils/shell-destinations'

describe('resolveShellDestination', () => {
  it.each([
    ['/', 'hoje'],
    ['/habits/123', 'hoje'],
    ['/calendar', 'calendario'],
    ['/calendar-sync', 'calendario'],
    ['/goals/123', 'progresso'],
    ['/streak', 'progresso'],
    ['/retrospective', 'progresso'],
    ['/wrapped', 'progresso'],
    ['/achievements', 'perfil'],
    ['/preferences', 'perfil'],
    ['/advanced', 'perfil'],
    ['/profile/security', 'perfil'],
    ['/notifications/123', 'perfil'],
    ['/account/billing', 'perfil'],
  ] as const)('maps %s to %s', (pathname, destination) => {
    expect(resolveShellDestination(pathname)).toBe(destination)
  })

  it('leaves navigation-free and unknown routes without a selected destination', () => {
    expect(resolveShellDestination('/upgrade')).toBeNull()
    expect(resolveShellDestination('/unknown')).toBeNull()
    expect(resolveShellDestination('/calendarized')).toBeNull()
  })
})

describe('isPrimaryShellDestination', () => {
  it.each(['/', '/calendar', '/progress', '/profile', '/calendar/'])('accepts %s', (pathname) => {
    expect(isPrimaryShellDestination(pathname)).toBe(true)
  })

  it.each(['/chat', '/upgrade', '/calendar-sync', '/profile/security'])('rejects %s', (pathname) => {
    expect(isPrimaryShellDestination(pathname)).toBe(false)
  })
})
