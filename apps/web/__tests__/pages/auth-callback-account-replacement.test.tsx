import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { LoginResponse } from '@orbit/shared/types/auth'

const STORAGE_KEY = 'sb-wdscxamegetmhqldqsdg-auth-token'
const mocks = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => Promise<void>) | null,
  replace: vi.fn(),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  exchange: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: {
    signOut: mocks.signOut,
    onAuthStateChange: (callback: typeof mocks.callback) => {
      mocks.callback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    },
  } }),
}))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: () => Promise.resolve() }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

import AuthCallbackPage from '@/app/(auth)/auth-callback/page'
import { useAuthStore } from '@/stores/auth-store'

function account(userId: string): LoginResponse {
  return { userId, name: userId, email: `${userId}@example.com` }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wdscxamegetmhqldqsdg.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key'
  mocks.callback = null
  mocks.replace.mockReset()
  mocks.exchange.mockReset().mockResolvedValue({
    ok: true,
    json: async () => account('account-a'),
  })
  vi.stubGlobal('fetch', mocks.exchange)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, task: () => Promise<unknown>) => task() },
  })
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/auth-callback')
})

it('keeps account B when a saved account A callback is revisited', async () => {
  useAuthStore.getState().setAuth(account('account-a'))
  localStorage.setItem(STORAGE_KEY, 'account-a-session')

  useAuthStore.getState().setAuth(account('account-b'))
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  window.history.replaceState(null, '', '/auth-callback#access_token=account-a-access&refresh_token=old')
  render(<AuthCallbackPage />)

  await act(async () => {
    await mocks.callback?.('INITIAL_SESSION', { access_token: 'account-a-access' } as Session)
  })

  expect(mocks.exchange).not.toHaveBeenCalled()
  await waitFor(() => expect(useAuthStore.getState().user?.userId).toBe('account-b'))
  expect(useAuthStore.getState().user?.userId).toBe('account-b')
  expect(mocks.replace).toHaveBeenCalledWith('/login')
})
