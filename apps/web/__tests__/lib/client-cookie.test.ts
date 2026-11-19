import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { readClientCookie, writeClientCookie } from '@/lib/client-cookie'
import { applyProfilePresentation } from '@/lib/profile-presentation'
import { writeSidebarCollapsedCookie } from '@/lib/sidebar-preference'
import { setCurrentTheme } from '@/stores/theme-store'

const ONE_YEAR = 'path=/; max-age=31536000; SameSite=Strict; Secure'

function captureWrites() {
  const writes: string[] = []
  vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => { writes.push(value) })
  return writes
}

beforeEach(() => {
  vi.restoreAllMocks()
  document.cookie = 'probe=; path=/; max-age=0'
  document.cookie = 'probe_two=; path=/; max-age=0'
  document.cookie = 'prefix_probe=; path=/; max-age=0'
})

describe('client cookie helpers', () => {
  it('writes a one-year strict secure cookie with an encoded value', () => {
    const writes = captureWrites()
    writeClientCookie('probe', 'a b;c')
    expect(writes).toEqual([`probe=a%20b%3Bc; ${ONE_YEAR}`])
  })

  it('reads the raw value of the named cookie only', () => {
    document.cookie = 'probe_two=2; path=/'
    document.cookie = 'probe=1; path=/'
    expect(readClientCookie('probe')).toBe('1')
    expect(readClientCookie('probe_two')).toBe('2')
    expect(readClientCookie('missing')).toBeUndefined()
  })

  it('does not match a cookie whose name only ends with the requested name', () => {
    document.cookie = 'prefix_probe=1; path=/'
    expect(readClientCookie('probe')).toBeUndefined()
  })
})

describe('cookie writers that share the one-year attributes', () => {
  it.each([
    { name: 'sidebar preference', write: () => writeSidebarCollapsedCookie(true), expected: `orbit_sidebar_collapsed=1; ${ONE_YEAR}` },
    { name: 'theme mode', write: () => setCurrentTheme('light'), expected: `orbit_theme_mode=light; ${ONE_YEAR}` },
    {
      name: 'profile presentation',
      write: () => applyProfilePresentation(createMockProfile({ colorScheme: 'orange', themePreference: null, language: 'en' })),
      expected: `orbit_color_scheme=orange; ${ONE_YEAR}`,
    },
  ])('writes the $name cookie with the shared attributes', ({ write, expected }) => {
    const writes = captureWrites()
    write()
    expect(writes).toContain(expected)
  })
})
