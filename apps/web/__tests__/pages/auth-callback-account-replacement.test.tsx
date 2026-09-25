import { act, render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { LoginResponse } from '@orbit/shared/types/auth'

const SUPABASE_STORAGE_KEY = 'sb-wdscxamegetmhqldqsdg-auth-token'
const mocks = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  exchange: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
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
vi.mock('@/lib/throttle-fetch', () => ({ fetchWithThrottle: mocks.exchange }))
vi.mock('@/app/(auth)/login/login-form-helpers', () => ({
  getCookieValue: () => undefined,
  handleVerifySuccess: mocks.verify,
}))
vi.mock('@/app/(auth)/login/login-content', () => ({ LoginContent: () => null }))

import AuthCallbackPage from '@/app/(auth)/auth-callback/page'
import { useAuthStore } from '@/stores/auth-store'
import { markGoogleAuthStarted } from '@/lib/google-auth-session'

function account(userId: string): LoginResponse {
  return { userId, name: userId, email: `${userId}@example.com` }
}

beforeEach(() => {
  mocks.callback = null
  mocks.exchange.mockReset()
  mocks.verify.mockReset()
  mocks.replace.mockReset()
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wdscxamegetmhqldqsdg.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key'
  sessionStorage.clear()
  localStorage.removeItem(SUPABASE_STORAGE_KEY)
  window.history.replaceState(null, '', '/auth-callback')
})

it('keeps account B after removing A Supabase session and revisiting the callback', async () => {
  useAuthStore.getState().setAuth(account('account-a'))
  localStorage.setItem(SUPABASE_STORAGE_KEY, 'account-a-session')
  markGoogleAuthStarted()

  useAuthStore.getState().setAuth(account('account-b'))
  expect(localStorage.getItem(SUPABASE_STORAGE_KEY)).toBeNull()
  expect(sessionStorage.getItem('orbit_google_auth_started_at')).toBeNull()
  window.history.replaceState(null, '', '/auth-callback#access_token=account-a-access&refresh_token=old-refresh')
  render(<AuthCallbackPage />)
  await act(async () => {
    mocks.callback?.('INITIAL_SESSION', { access_token: 'account-a-access' } as Session)
  })

  expect(mocks.exchange).not.toHaveBeenCalled()
  expect(mocks.verify).not.toHaveBeenCalled()
  expect(useAuthStore.getState().user?.userId).toBe('account-b')
  expect(mocks.replace).toHaveBeenCalledWith('/login')
})
