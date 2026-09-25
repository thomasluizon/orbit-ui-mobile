import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  exchange: vi.fn(),
  verify: vi.fn(),
  setAuth: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ setAuth: mocks.setAuth }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (callback: typeof mocks.callback) => {
        mocks.callback = callback
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
      },
    },
  }),
}))
vi.mock('@/lib/throttle-fetch', () => ({ fetchWithThrottle: mocks.exchange }))
vi.mock('@/app/(auth)/login/login-form-helpers', () => ({
  getCookieValue: () => undefined,
  handleVerifySuccess: mocks.verify,
}))
vi.mock('@/app/(auth)/login/login-content', () => ({ LoginContent: () => null }))

import AuthCallbackPage from '@/app/(auth)/auth-callback/page'
import { markGoogleAuthStarted } from '@/lib/google-auth-session'

const restoredSession = { access_token: 'account-a-access', provider_token: 'google-token' } as Session

describe('Google auth callback', () => {
  beforeEach(() => {
    mocks.callback = null
    mocks.exchange.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'account-a', name: 'A', email: 'a@example.com' }),
    })
    mocks.verify.mockReset().mockResolvedValue(undefined)
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.setAuth.mockReset()
    mocks.unsubscribe.mockReset()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
  })

  it.each(['INITIAL_SESSION', 'SIGNED_IN'] as const)(
    'refuses a %s event restored without an OAuth redirect', async (event) => {
      render(<AuthCallbackPage />)
      await act(async () => { mocks.callback?.(event, restoredSession) })

      expect(mocks.exchange).not.toHaveBeenCalled()
      expect(mocks.verify).not.toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith('/login')
    },
  )

  it('refuses a saved OAuth link without an auth attempt in this tab', async () => {
    window.history.replaceState(null, '', '/auth-callback#access_token=account-a-access&refresh_token=old-refresh')
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('refuses a restored session that differs from the redirect token', async () => {
    const attemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${attemptId}#access_token=another-account&refresh_token=fresh-refresh`)
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('refuses an old callback while a different Google attempt is active', async () => {
    const oldAttemptId = markGoogleAuthStarted()
    markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${oldAttemptId}#access_token=account-a-access&refresh_token=old-refresh`)
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('keeps the newer attempt valid after an old OAuth link is rejected', async () => {
    const oldAttemptId = markGoogleAuthStarted()
    const newerAttemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${oldAttemptId}#access_token=account-a-access&refresh_token=old-refresh`)
    const oldCallback = render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    oldCallback.unmount()

    window.history.replaceState(null, '', `/auth-callback?authAttempt=${newerAttemptId}#access_token=account-a-access&refresh_token=fresh-refresh`)
    render(<AuthCallbackPage />)
    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce())
    expect(mocks.exchange).toHaveBeenCalledWith('/api/auth/google', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('account-a-access'),
    }))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it('clears a malformed marker with an empty attempt id', async () => {
    markGoogleAuthStarted()
    const markerKey = sessionStorage.key(0)
    expect(markerKey).not.toBeNull()
    sessionStorage.setItem(markerKey!, `${Date.now()}:`)
    window.history.replaceState(null, '', '/auth-callback?authAttempt=unmatched#access_token=account-a-access&refresh_token=old-refresh')
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(sessionStorage.getItem(markerKey!)).toBeNull()
  })

  it.each([
    ['Google sign in', null, '/'],
    ['Google Calendar connection', '/calendar-sync', '/calendar-sync'],
  ])('accepts a fresh %s redirect', async (_flow, returnUrl, expectedReturnUrl) => {
    const attemptId = markGoogleAuthStarted()
    window.history.replaceState(null, '', `/auth-callback?authAttempt=${attemptId}#access_token=account-a-access&refresh_token=fresh-refresh`)
    if (returnUrl) sessionStorage.setItem('auth_return_url', returnUrl)
    render(<AuthCallbackPage />)

    await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce())
    expect(mocks.exchange).toHaveBeenCalledWith('/api/auth/google', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('account-a-access'),
    }))
    expect(mocks.verify.mock.calls[0]?.[4]()).toBe(expectedReturnUrl)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('refuses a redirect after the pending auth window expires', async () => {
    window.history.replaceState(null, '', '/auth-callback#access_token=account-a-access&refresh_token=old-refresh')
    markGoogleAuthStarted()
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    try {
      render(<AuthCallbackPage />)
      await act(async () => { mocks.callback?.('INITIAL_SESSION', restoredSession) })
      expect(mocks.exchange).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
