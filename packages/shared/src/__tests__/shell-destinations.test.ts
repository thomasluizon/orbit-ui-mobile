import { describe, expect, it } from 'vitest'
import { resolveShellDestination } from '../utils/shell-destinations'

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
    ['/achievements', 'progresso'],
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
