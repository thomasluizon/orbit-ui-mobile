import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const heldAccount = vi.hoisted(() => ({ id: null as string | null }))
const accountGeneration = vi.hoisted(() => ({ current: 0 }))
const showPersistentError = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError }) }))
vi.mock('@/stores/auth-store', () => ({ getHeldAccountId: () => heldAccount.id }))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => accountGeneration.current }))

vi.mock('@/lib/actions/profile', () => ({
  updateColorScheme: vi.fn().mockResolvedValue(undefined),
  updateThemePreference: vi.fn().mockResolvedValue(undefined),
}))

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

vi.spyOn(document, 'querySelector').mockImplementation(() => null)

import { useColorScheme } from '@/hooks/use-color-scheme'

describe('useColorScheme', () => {
  beforeEach(() => {
    mockCookies = {}
    heldAccount.id = null
    accountGeneration.current = 0
    showPersistentError.mockClear()
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
    expect(result.current.currentScheme).toBe('purple')
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

  it('does not restore the old theme after another account replaces the tab', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    let rejectUpdate: ((error: unknown) => void) | undefined
    vi.mocked(updateThemePreference).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectUpdate = reject
    }))
    heldAccount.id = 'account-a'
    const { result } = renderHook(() => useColorScheme())

    act(() => result.current.applyTheme('light'))
    heldAccount.id = 'account-b'
    await act(async () => rejectUpdate?.({ code: 'ACCOUNT_CHANGED', status: 409 }))

    expect(mockCookies['orbit_theme_mode']).toBe('light')
    expect(showPersistentError).toHaveBeenCalledWith('errors.api.accountChanged', 'common.dismiss')
  })

  it('does not restore an old theme after re-login to the same account', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    let rejectUpdate: ((error: unknown) => void) | undefined
    vi.mocked(updateThemePreference).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectUpdate = reject
    }))
    heldAccount.id = 'account-a'
    const { result } = renderHook(() => useColorScheme())

    act(() => result.current.applyTheme('light'))
    accountGeneration.current += 1
    await act(async () => rejectUpdate?.(new Error('Network failed')))

    expect(mockCookies['orbit_theme_mode']).toBe('light')
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
    const { updateThemePreference } = await import('@/lib/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded('dark')
    })

    expect(mock).not.toHaveBeenCalled()
  })

  it('detectAndSaveThemeIfNeeded no-ops when DB has light', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded('light')
    })

    expect(mock).not.toHaveBeenCalled()
  })

  it('detectAndSaveThemeIfNeeded persists detected theme when DB is null', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded(null)
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'dark' }, null)
  })

  it('detectAndSaveThemeIfNeeded persists detected theme when DB is undefined', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.detectAndSaveThemeIfNeeded(undefined)
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'dark' }, null)
  })

  it('applyTheme persists to DB by default', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
    const mock = vi.mocked(updateThemePreference)
    mock.mockClear()

    const { result } = renderHook(() => useColorScheme())

    act(() => {
      result.current.applyTheme('light')
    })

    expect(mock).toHaveBeenCalledWith({ themePreference: 'light' }, null)
  })

  it('applyTheme skips persistence when persistToDb is false', async () => {
    const { updateThemePreference } = await import('@/lib/actions/profile')
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
