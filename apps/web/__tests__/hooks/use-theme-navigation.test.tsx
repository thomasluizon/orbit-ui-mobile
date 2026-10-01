import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import type { Profile, ThemeMode } from '@orbit/shared/types/profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useProfile } from '@/hooks/use-profile'
import { updateThemePreference } from '@/lib/actions/profile'
import { canvasColor } from '@/lib/theme-dom'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: vi.fn() }) }))
vi.mock('@/stores/auth-store', () => ({ getHeldAccountId: () => null }))
vi.mock('@/lib/actions/profile', () => ({ updateThemePreference: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: vi.fn() }))

function setup(previous: ThemeMode) {
  document.cookie = `orbit_theme_mode=${previous}; path=/`
  const profile = createMockProfile({ themePreference: previous })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(profileKeys.detail(), profile)
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const chooser = renderHook(() => useColorScheme(), { wrapper })
  return { client, wrapper, chooser, profile }
}

function expectTheme(client: QueryClient, theme: ThemeMode) {
  expect(client.getQueryData<Profile>(profileKeys.detail())?.themePreference).toBe(theme)
  expect(document.cookie).toContain(`orbit_theme_mode=${theme}`)
  expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe(theme)
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe(canvasColor('orange', theme))
}

afterEach(() => vi.clearAllMocks())

describe('theme choice across profile consumers', () => {
  it.each([['dark', 'light'], ['light', 'dark']] as const)(
    'keeps %s to %s after navigation and a successful save', async (previous, chosen) => {
      let resolveSave: () => void = () => {}
      vi.mocked(updateThemePreference).mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve }))
      const { client, wrapper, chooser, profile } = setup(previous)
      await act(async () => chooser.result.current.applyTheme(chosen))
      const destination = renderHook(() => useProfile({ enabled: false, initialData: profile }), { wrapper })

      await waitFor(() => expect(destination.result.current.profile?.themePreference).toBe(chosen))
      expectTheme(client, chosen)
      await act(async () => resolveSave())
      expectTheme(client, chosen)
    },
  )

  it('restores the previous theme and preserves unrelated cache edits after a failed save', async () => {
    let rejectSave: (error: Error) => void = () => {}
    vi.mocked(updateThemePreference).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject }))
    const { client, wrapper, chooser, profile } = setup('dark')
    await act(async () => chooser.result.current.applyTheme('light'))
    const destination = renderHook(() => useProfile({ enabled: false, initialData: profile }), { wrapper })
    await waitFor(() => expect(destination.result.current.profile?.themePreference).toBe('light'))
    await act(async () => destination.result.current.patchProfile({ name: 'Changed' }))
    await act(async () => rejectSave(new Error('Save failed')))

    await waitFor(() => expect(destination.result.current.profile?.themePreference).toBe('dark'))
    expect(chooser.result.current.currentTheme).toBe('dark')
    expectTheme(client, 'dark')
    expect(client.getQueryData<Profile>(profileKeys.detail())?.name).toBe('Changed')
  })
})
