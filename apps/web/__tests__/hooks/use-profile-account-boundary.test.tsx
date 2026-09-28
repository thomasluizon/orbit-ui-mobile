import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { getQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { retireHeldAccount } from '@/__tests__/support/account-change'

vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    syncSchemeFromProfile: vi.fn(),
    syncThemeFromProfile: vi.fn(),
    detectAndSaveSchemeIfNeeded: vi.fn(),
    detectAndSaveThemeIfNeeded: vi.fn(),
  }),
}))

describe('profile fetch across the first session check', () => {
  afterEach(() => {
    getQueryClient().clear()
    vi.unstubAllGlobals()
  })

  it('leaves loading when the held profile response arrives', async () => {
    const queryClient = getQueryClient()
    queryClient.clear()
    vi.stubGlobal('fetch', vi.fn())
    await retireHeldAccount()
    let answer: () => void = () => {}
    const profileAnswer = new Promise<void>((resolve) => { answer = resolve })
    const profile = createMockProfile({ name: 'Answered' })
    const fetchMock = vi.fn((input: string) => {
      if (input === '/api/auth/session') {
        return Promise.resolve(new Response(JSON.stringify({
          expiresAt: Date.now() + 3600000,
          userId: 'account-a',
        }), { status: 200 }))
      }
      if (input === API.profile.get) {
        return profileAnswer.then(() => new Response(JSON.stringify(profile), { status: 200 }))
      }
      throw new Error(`Unexpected fetch: ${input}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

    const { result } = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(true))
    await act(async () => { await useAuthStore.getState().checkSession() })
    await act(async () => { answer() })

    await waitFor(() => expect(result.current.profile?.name).toBe('Answered'))
    expect(result.current.isLoading).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(API.profile.get, expect.anything())
  })
})
