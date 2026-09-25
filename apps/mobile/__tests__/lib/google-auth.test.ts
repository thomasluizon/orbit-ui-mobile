import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
import { ApiClientError } from '@orbit/shared/utils'
import { clearPendingGoogleAuthSession } from '@/lib/google-auth-callback'

const {
  apiClientMock,
  setSessionMock,
  signOutMock,
  signInWithOAuthMock,
  openAuthSessionAsyncMock,
} = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
  setSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  openAuthSessionAsyncMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      setSession: setSessionMock,
      signOut: signOutMock,
      signInWithOAuth: signInWithOAuthMock,
    },
  }),
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: openAuthSessionAsyncMock,
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))

const { completeGoogleAuthFromUrl, startMobileGoogleAuth } = await import('@/lib/google-auth')

const CALLBACK = 'https://app.useorbit.org/auth-callback'

const loginResponse = {
  token: 'jwt-token',
  refreshToken: 'refresh-token',
  userId: 'user-1',
  name: 'Thomas',
  email: 'thomas@example.com',
}

describe('completeGoogleAuthFromUrl', () => {
  beforeEach(() => {
    apiClientMock.mockReset()
    setSessionMock.mockReset()
    signOutMock.mockReset().mockResolvedValue(undefined)
  })

  it('returns the direct backend token payload without exchanging a session', async () => {
    const url = `${CALLBACK}?token=jwt-token&refreshToken=refresh-token&userId=user-1&name=Thomas&email=thomas%40example.com`

    const result = await completeGoogleAuthFromUrl(url, 'en')

    expect(result).toEqual(loginResponse)
    expect(setSessionMock).not.toHaveBeenCalled()
    expect(apiClientMock).not.toHaveBeenCalled()
  })

  it('throws the backend error description when the callback carries an error', async () => {
    const url = `${CALLBACK}?error=access_denied&error_description=User%20cancelled`

    await expect(completeGoogleAuthFromUrl(url, 'en')).rejects.toThrow('User cancelled')
    expect(apiClientMock).not.toHaveBeenCalled()
  })

  it('throws when neither tokens nor a backend payload are present', async () => {
    await expect(completeGoogleAuthFromUrl(CALLBACK, 'en')).rejects.toThrow('Authentication failed')
  })

  it('exchanges a supabase session via apiClient and forwards the language + referral', async () => {
    const url = `${CALLBACK}#access_token=supa-access&refresh_token=supa-refresh&provider_token=g-access&provider_refresh_token=g-refresh`
    setSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'supa-access',
          provider_token: null,
          provider_refresh_token: null,
        },
      },
      error: null,
    })
    apiClientMock.mockResolvedValue(loginResponse)

    const result = await completeGoogleAuthFromUrl(url, 'pt-BR', 'REF123')

    expect(result).toEqual(loginResponse)
    expect(apiClientMock).toHaveBeenCalledWith(
      '/api/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          accessToken: 'supa-access',
          language: 'pt-BR',
          googleAccessToken: 'g-access',
          googleRefreshToken: 'g-refresh',
          referralCode: 'REF123',
        }),
      }),
    )
    expect(signOutMock).toHaveBeenCalled()
  })

  it('signs out of supabase even when the backend exchange fails', async () => {
    const url = `${CALLBACK}#access_token=supa-access&refresh_token=supa-refresh`
    setSessionMock.mockResolvedValue({
      data: { session: { access_token: 'supa-access' } },
      error: null,
    })
    apiClientMock.mockRejectedValue(
      new ApiClientError(400, 'Invalid Google token', { code: 'INVALID_VERIFICATION_CODE' }),
    )

    await expect(completeGoogleAuthFromUrl(url, 'en')).rejects.toBeInstanceOf(ApiClientError)
    expect(signOutMock).toHaveBeenCalled()
  })

  it('throws when supabase rejects the session', async () => {
    const url = `${CALLBACK}#access_token=supa-access&refresh_token=supa-refresh`
    setSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: 'session expired' },
    })

    await expect(completeGoogleAuthFromUrl(url, 'en')).rejects.toThrow('session expired')
    expect(apiClientMock).not.toHaveBeenCalled()
  })
})

describe('startMobileGoogleAuth', () => {
  beforeEach(async () => {
    await clearPendingGoogleAuthSession()
    signInWithOAuthMock.mockReset()
    openAuthSessionAsyncMock.mockReset()
  })

  it('rejects an old callback promoted by Expo during a new browser attempt', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockResolvedValueOnce({ type: 'cancel' })
    await startMobileGoogleAuth({})
    const oldRedirectTo = openAuthSessionAsyncMock.mock.calls[0]?.[1] as string
    openAuthSessionAsyncMock.mockResolvedValueOnce({ type: 'success',
      url: `${oldRedirectTo}#access_token=account-a&refresh_token=old-refresh` })

    const result = await startMobileGoogleAuth({})

    expect(result).toEqual({ type: 'dismiss' })
    expect(openAuthSessionAsyncMock).toHaveBeenCalledTimes(2)
    expect(openAuthSessionAsyncMock.mock.calls[1]?.[1]).not.toBe(oldRedirectTo)
  })

  it.each([false, true])('accepts a fresh OAuth callback with forceConsent=%s', async (forceConsent) => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockImplementation((_url: string, redirectTo: string) => ({
      type: 'success', url: `${redirectTo}#access_token=a&refresh_token=b`,
    }))

    const result = await startMobileGoogleAuth({ forceConsent })

    const callbackUrl = result.type === 'success' ? result.url : ''
    expect(result).toEqual({ type: 'success', url: callbackUrl })
    expect(callbackUrl).toMatch(/^https:\/\/app\.useorbit\.org\/auth-callback\?authAttempt=[a-f0-9-]{36}#access_token=a&refresh_token=b$/)
    const oauthArgs = signInWithOAuthMock.mock.calls[0]?.[0] as {
      provider: string
      options: { redirectTo: string; skipBrowserRedirect: boolean }
    }
    expect(oauthArgs.provider).toBe('google')
    expect(oauthArgs.options.redirectTo).toBe(callbackUrl.split('#')[0])
    expect(oauthArgs.options.skipBrowserRedirect).toBe(true)
    if (forceConsent) {
      expect(signInWithOAuthMock.mock.calls[0]?.[0].options.queryParams.prompt).toBe('consent')
    }
    expect(openAuthSessionAsyncMock).toHaveBeenCalledWith('https://accounts.google.com/o', oauthArgs.options.redirectTo)
  })

  it('returns the browser result type when the session is dismissed', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockResolvedValue({ type: 'dismiss' })

    const result = await startMobileGoogleAuth({})

    expect(result).toEqual({ type: 'dismiss' })
    expect(await SecureStore.getItemAsync('google_auth_attempt')).toBeNull()
  })

  it('reports a dismiss when the browser succeeds without a callback url', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockResolvedValue({ type: 'success' })

    const result = await startMobileGoogleAuth({})

    expect(result).toEqual({ type: 'dismiss' })
  })

  it('maps an access_denied callback to a cancel result', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockResolvedValue({
      type: 'success',
      url: `${CALLBACK}?error=access_denied`,
    })

    const result = await startMobileGoogleAuth({})

    expect(result).toEqual({ type: 'cancel' })
  })

  it('throws when supabase fails to produce an OAuth url', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: null }, error: { message: 'provider down' } })

    await expect(startMobileGoogleAuth({})).rejects.toThrow('provider down')
    expect(openAuthSessionAsyncMock).not.toHaveBeenCalled()
    expect(await SecureStore.getItemAsync('google_auth_attempt')).toBeNull()
  })

  it('rethrows and clears the pending session when the browser throws', async () => {
    signInWithOAuthMock.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
    openAuthSessionAsyncMock.mockRejectedValue(new Error('browser crashed'))

    await expect(startMobileGoogleAuth({})).rejects.toThrow('browser crashed')
  })
})
