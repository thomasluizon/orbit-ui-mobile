import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import {
  applyProfilePresentation,
  hydrateProfilePresentation,
} from '@/lib/profile-presentation'

function createMatchMediaMock(matches: boolean): typeof globalThis.window.matchMedia {
  return ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof globalThis.window.matchMedia
}

describe('profile presentation helpers', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
    document.cookie = 'orbit_color_scheme=;max-age=0;path=/'
    document.cookie = 'orbit_theme_mode=;max-age=0;path=/'
    document.cookie = 'i18n_locale=;max-age=0;path=/'
    Object.defineProperty(globalThis.window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: createMatchMediaMock(false),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies cookies and uses the system light preference when needed', () => {
    globalThis.window.matchMedia = createMatchMediaMock(true)

    applyProfilePresentation({
      colorScheme: 'green',
      themePreference: null,
      language: 'pt-BR',
    })

    expect(document.documentElement).toHaveClass('scheme-orange', 'light')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#C4530F')
    expect(document.cookie).toContain('orbit_color_scheme=orange')
    expect(document.cookie).toContain('orbit_theme_mode=light')
    expect(document.cookie).toContain('i18n_locale=pt-BR')
  })

  it('falls back to the dark theme when a system preference is unavailable', () => {
    globalThis.window.matchMedia = undefined as unknown as typeof globalThis.window.matchMedia

    applyProfilePresentation({
      colorScheme: null,
      themePreference: null,
      language: 'en',
    })

    expect(document.documentElement).toHaveClass('scheme-orange', 'dark')
    expect(document.cookie).toContain('orbit_color_scheme=orange')
    expect(document.cookie).toContain('i18n_locale=en')
  })

  it('hydrates and applies the fetched profile', async () => {
    const profile = createMockProfile({
      colorScheme: 'green',
      themePreference: 'dark',
      language: 'pt-BR',
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => profile,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(hydrateProfilePresentation()).resolves.toEqual(profile)

    expect(fetchMock).toHaveBeenCalledWith(API.profile.get, { cache: 'no-store' })
    expect(document.documentElement).toHaveClass('scheme-orange', 'dark')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#C4530F')
    expect(document.cookie).toContain('orbit_color_scheme=orange')
  })

  it.each(['purple', 'blue', 'green', 'rose', 'orange', 'cyan', null])(
    'hydrates the granted accent from stored value %s',
    (stored) => {
      applyProfilePresentation({ colorScheme: stored, themePreference: 'dark', language: 'en' })
      expect(document.cookie).toContain('orbit_color_scheme=orange')
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#C4530F')
    },
  )

  it('returns null when hydration fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    await expect(hydrateProfilePresentation()).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network')
    }))
    await expect(hydrateProfilePresentation()).resolves.toBeNull()
  })
})
