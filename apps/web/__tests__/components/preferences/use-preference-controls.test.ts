import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { usePreferenceControls } from '@/app/(app)/preferences/_components/use-preference-controls'

const mockPush = vi.fn()
const mockPatchProfile = vi.fn()
const mockApplyScheme = vi.fn()
const mockApplyTheme = vi.fn()

const profileRef = vi.hoisted(() => ({
  value: {} as { hasProAccess: boolean; weekStartDay: 0 | 1; colorScheme: string } | undefined,
}))
const authRef = vi.hoisted(() => ({ isAuthenticated: true }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileRef.value, patchProfile: mockPatchProfile }),
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    currentScheme: 'purple',
    currentTheme: 'dark',
    applyScheme: mockApplyScheme,
    applyTheme: mockApplyTheme,
  }),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: authRef.isAuthenticated }),
}))
vi.mock('@/app/actions/profile', () => ({
  updateWeekStartDay: vi.fn(),
  updateColorScheme: vi.fn(),
  updateLanguage: vi.fn(),
}))

const reloadMock = vi.fn()
const originalLocation = globalThis.location

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePreferenceControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    profileRef.value = { hasProAccess: true, weekStartDay: 0, colorScheme: 'purple' }
    authRef.isAuthenticated = true
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { reload: reloadMock, href: 'http://localhost/', pathname: '/' },
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('clears the legacy time-format preference on mount', () => {
    localStorage.setItem('orbit_time_format', '24h')
    renderHook(() => usePreferenceControls(), { wrapper })
    expect(localStorage.getItem('orbit_time_format')).toBeNull()
  })

  it('persists the language, calls the backend, and reloads for an authenticated user', async () => {
    const { updateLanguage } = await import('@/app/actions/profile')
    vi.mocked(updateLanguage).mockResolvedValue(undefined)
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })

    await act(async () => {
      await result.current.handleLanguageChange('pt-BR')
    })

    expect(updateLanguage).toHaveBeenCalledWith({ language: 'pt-BR' })
    expect(document.cookie).toContain('i18n_locale=pt-BR')
    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(result.current.selectedLanguage).toBe('pt-BR')
  })

  it('reverts the language when the backend update fails', async () => {
    const { updateLanguage } = await import('@/app/actions/profile')
    vi.mocked(updateLanguage).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })

    await act(async () => {
      await result.current.handleLanguageChange('pt-BR')
    })

    expect(reloadMock).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.selectedLanguage).toBe('en'))
  })

  it('skips the backend call but still reloads when unauthenticated', async () => {
    authRef.isAuthenticated = false
    const { updateLanguage } = await import('@/app/actions/profile')
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })

    await act(async () => {
      await result.current.handleLanguageChange('pt-BR')
    })

    expect(updateLanguage).not.toHaveBeenCalled()
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('optimistically updates the week-start day', async () => {
    const { updateWeekStartDay } = await import('@/app/actions/profile')
    vi.mocked(updateWeekStartDay).mockResolvedValue(undefined)
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })

    await act(async () => {
      await result.current.weekStartMutation.mutateAsync(1)
    })

    expect(mockPatchProfile).toHaveBeenCalledWith({ weekStartDay: 1 })
    expect(updateWeekStartDay).toHaveBeenCalledWith({ weekStartDay: 1 })
  })

  it('rolls the week-start day back on error', async () => {
    const { updateWeekStartDay } = await import('@/app/actions/profile')
    vi.mocked(updateWeekStartDay).mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })

    await act(async () => {
      await result.current.weekStartMutation.mutateAsync(1).catch(() => undefined)
    })

    expect(mockPatchProfile).toHaveBeenLastCalledWith({ weekStartDay: 0 })
  })

  it('applies and persists a scheme the user is entitled to', () => {
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })
    act(() => result.current.handleSchemeChange('blue'))
    expect(mockApplyScheme).toHaveBeenCalledWith('blue')
    expect(mockPatchProfile).toHaveBeenCalledWith({ colorScheme: 'blue' })
  })

  it('routes a free user to upgrade instead of applying a locked scheme', () => {
    profileRef.value = { hasProAccess: false, weekStartDay: 0, colorScheme: 'purple' }
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })
    act(() => result.current.handleSchemeChange('blue'))
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(mockApplyScheme).not.toHaveBeenCalled()
  })

  it('ignores a theme change to the already-active mode', () => {
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })
    act(() => result.current.handleThemeModeChange('dark'))
    expect(mockApplyTheme).not.toHaveBeenCalled()
    act(() => result.current.handleThemeModeChange('light'))
    expect(mockApplyTheme).toHaveBeenCalledWith('light')
  })

  it('toggles and persists the show-general-on-today preference', () => {
    const { result } = renderHook(() => usePreferenceControls(), { wrapper })
    expect(result.current.showGeneralOnToday).toBe(false)
    act(() => result.current.toggleShowGeneral())
    expect(result.current.showGeneralOnToday).toBe(true)
    expect(localStorage.getItem('orbit_show_general_on_today')).toBe('true')
  })
})
