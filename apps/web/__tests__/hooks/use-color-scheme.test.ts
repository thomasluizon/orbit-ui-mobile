import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock profile action
vi.mock('@/app/actions/profile', () => ({
  updateColorScheme: vi.fn().mockResolvedValue(undefined),
  updateThemePreference: vi.fn().mockResolvedValue(undefined),
}))

// Mock matchMedia for prefers-color-scheme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock document.cookie
let mockCookies: Record<string, string> = {}
Object.defineProperty(document, 'cookie', {
  get: () =>
    Object.entries(mockCookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; '),
  set: (value: string) => {
    const parts = value.split(';')
    const [nameValue] = parts
    if (nameValue) {
      const eqIdx = nameValue.indexOf('=')
      if (eqIdx >= 0) {
        const name = nameValue.slice(0, eqIdx).trim()
        const val = nameValue.slice(eqIdx + 1).trim()
        mockCookies[name] = decodeURIComponent(val)
      }
    }
  },
  configurable: true,
})

// Mock DOM manipulation
const mockSetProperty = vi.fn()
const mockClassList = {
  add: vi.fn(),
  remove: vi.fn(),
}

Object.defineProperty(document, 'documentElement', {
  value: {
    style: { setProperty: mockSetProperty },
    classList: mockClassList,
  },
  writable: true,
  configurable: true,
})

// Mock meta tags
vi.spyOn(document, 'querySelector').mockImplementation(() => null)

import { useColorScheme } from '@/hooks/use-color-scheme'

describe('useColorScheme', () => {
  beforeEach(() => {
    mockCookies = {}
    mockSetProperty.mockClear()
    mockClassList.add.mockClear()
    mockClassList.remove.mockClear()
  })

  it('defaults to purple scheme', () => {
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentScheme).toBe('purple')
  })

  it('defaults to dark theme', () => {
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentTheme).toBe('dark')
  })

  it('reads scheme from cookie', () => {
    mockCookies['orbit_color_scheme'] = 'blue'
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentScheme).toBe('blue')
  })

  it('reads theme from cookie', () => {
    mockCookies['orbit_theme_mode'] = 'light'
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentTheme).toBe('light')
  })

  it('ignores invalid scheme from cookie', () => {
    mockCookies['orbit_color_scheme'] = 'invalid'
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentScheme).toBe('purple') // fallback
  })

  it('applyScheme updates current scheme', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyScheme('green')
    })

    expect(result.current.currentScheme).toBe('green')
  })

  it('applyScheme sets cookie', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyScheme('rose')
    })

    expect(mockCookies['orbit_color_scheme']).toBe('rose')
  })

  it('applyTheme updates current theme', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyTheme('light')
    })

    expect(result.current.currentTheme).toBe('light')
  })

  it('toggleTheme switches between dark and light', () => {
    const { result } = renderHook(() => useColorScheme())

    expect(result.current.currentTheme).toBe('dark')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.currentTheme).toBe('light')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.currentTheme).toBe('dark')
  })

  it('syncSchemeFromProfile updates scheme when DB differs', () => {
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentScheme).toBe('purple')

    act(() => {
      result.current.syncSchemeFromProfile('cyan')
    })

    expect(result.current.currentScheme).toBe('cyan')
  })

  it('syncSchemeFromProfile ignores null', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncSchemeFromProfile(null)
    })

    expect(result.current.currentScheme).toBe('purple')
  })

  it('syncSchemeFromProfile ignores invalid scheme', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncSchemeFromProfile('nonexistent')
    })

    expect(result.current.currentScheme).toBe('purple')
  })

  it('syncSchemeFromProfile does nothing when schemes match', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncSchemeFromProfile('purple')
    })

    // Still purple, no unnecessary updates
    expect(result.current.currentScheme).toBe('purple')
  })

  it('syncThemeFromProfile updates theme when DB differs', () => {
    const { result } = renderHook(() => useColorScheme())
    expect(result.current.currentTheme).toBe('dark')

    act(() => {
      result.current.syncThemeFromProfile('light')
    })

    expect(result.current.currentTheme).toBe('light')
  })

  it('syncThemeFromProfile ignores null', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncThemeFromProfile(null)
    })

    expect(result.current.currentTheme).toBe('dark')
  })

  it('syncThemeFromProfile ignores undefined', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncThemeFromProfile(undefined)
    })

    expect(result.current.currentTheme).toBe('dark')
  })

  it('syncThemeFromProfile ignores invalid theme', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncThemeFromProfile('nonexistent')
    })

    expect(result.current.currentTheme).toBe('dark')
  })

  it('syncThemeFromProfile does nothing when themes match', () => {
    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.syncThemeFromProfile('dark')
    })

    expect(result.current.currentTheme).toBe('dark')
  })

  it('detectAndSaveThemeIfNeeded no-ops when DB has dark', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded('dark')
    })

    expect(mock).not.toHaveBeenCalled()
  })

  it('detectAndSaveThemeIfNeeded no-ops when DB has light', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded('light')
    })

    expect(mock).not.toHaveBeenCalled()
  })

  it('detectAndSaveThemeIfNeeded persists detected theme when DB is null', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded(null)
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'dark' })
  })

  it('detectAndSaveThemeIfNeeded persists detected theme when DB is undefined', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded(undefined)
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'dark' })
  })

  it('applyTheme persists to DB by default', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyTheme('light')
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'light' })
  })

  it('applyTheme skips persistence when persistToDb is false', async () => {
    const { updateThemePreference } = await import('@/app/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyTheme('light', false)
    })

    expect(mock).not.toHaveBeenCalled()
    expect(result.current.currentTheme).toBe('light')
  })
})
