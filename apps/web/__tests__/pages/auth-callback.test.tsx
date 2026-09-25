import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  setAuth: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ setAuth: mocks.setAuth }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: {
    onAuthStateChange: (callback: typeof mocks.callback) => {
      mocks.callback = callback
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    },
  } }),
}))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: () => Promise.resolve() }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: () => null }))

import AuthCallbackPage from '@/app/(auth)/auth-callback/page'
import { markGoogleAuthStarted } from '@/lib/google-auth-session'

const restoredSession = { access_token: 'account-a-access', provider_token: 'google-token' } as Session
const fetchMock = vi.fn()

describe('Google auth callback', () => {
  beforeEach(() => {
    mocks.callback = null
    mocks.setAuth.mockReset()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.unsubscribe.mockReset()
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'account-a', name: 'A', email: 'a@example.com' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
  })

  it('rejects a restored account A session after account B replaces it', async () => {
    window.history.replaceState(null, '', '/auth-callback#access_token=account-a-access&refresh_token=old')
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.callback).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('rejects an old OAuth link while another attempt is active', async () => {
    const oldAttemptId = markGoogleAuthStarted()
    markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${oldAttemptId}#access_token=account-a-access`)
    render(<AuthCallbackPage />)

    expect(mocks.callback).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('keeps the newer attempt valid after an old OAuth link is rejected', async () => {
    const oldAttemptId = markGoogleAuthStarted()
    const newAttemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${oldAttemptId}#access_token=account-a-access`)
    const oldCallback = render(<AuthCallbackPage />)
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    oldCallback.unmount()

    window.history.replaceState(null, '', `/auth-callback?authAttempt=${newAttemptId}#access_token=account-a-access&refresh_token=fresh`)
    render(<AuthCallbackPage />)
    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(sessionStorage.getItem('orbit_google_auth_started_at')).toBeNull()
  })

  it('rejects a restored session with a different redirect token', async () => {
    const attemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${attemptId}#access_token=another-account`)
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })

  it('rejects an expired auth attempt', async () => {
    const attemptId = markGoogleAuthStarted()
    sessionStorage.setItem('orbit_google_auth_started_at', `${Date.now() - 11 * 60 * 1000}:${attemptId}`)
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${attemptId}#access_token=account-a-access`)
    render(<AuthCallbackPage />)

    expect(mocks.callback).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('orbit_google_auth_started_at')).toBeNull()
  })

  it.each([
    ['Google sign in', null, '/'],
    ['Google Calendar connection', '/calendar-sync', '/calendar-sync'],
  ])('accepts a fresh %s redirect', async (_flow, returnUrl, expectedReturnUrl) => {
    const attemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${attemptId}#access_token=account-a-access&refresh_token=fresh`)
    if (returnUrl) sessionStorage.setItem('auth_return_url', returnUrl)
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('account-a-access'),
    }))
    expect(mocks.push).toHaveBeenCalledWith(expectedReturnUrl)
  })
})
