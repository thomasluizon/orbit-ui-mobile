import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const themeDomMocks = vi.hoisted(() => ({
  applyThemeTokensToDOM: vi.fn(),
  normalizeColorScheme: vi.fn((value: string | null | undefined) =>
    value === 'green' ? 'green' : 'purple',
  ),
}))

vi.mock('@/lib/theme-dom', () => ({
  applyThemeTokensToDOM: themeDomMocks.applyThemeTokensToDOM,
  normalizeColorScheme: themeDomMocks.normalizeColorScheme,
}))

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
    themeDomMocks.applyThemeTokensToDOM.mockClear()
    themeDomMocks.normalizeColorScheme.mockClear()
    vi.unstubAllGlobals()
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

    expect(themeDomMocks.normalizeColorScheme).toHaveBeenCalledWith('green')
    expect(themeDomMocks.applyThemeTokensToDOM).toHaveBeenCalledWith('green', 'light', false)
    expect(document.cookie).toContain('orbit_color_scheme=green')
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

    expect(themeDomMocks.applyThemeTokensToDOM).toHaveBeenCalledWith('purple', 'dark', false)
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
    expect(themeDomMocks.applyThemeTokensToDOM).toHaveBeenCalledWith('green', 'dark', false)
  })

  it('returns null when hydration fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    await expect(hydrateProfilePresentation()).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network')
    }))
    await expect(hydrateProfilePresentation()).resolves.toBeNull()
  })
})
