import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@orbit/shared/utils'

const {
  apiClientMock,
  setSessionMock,
  signOutMock,
} = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
  setSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      setSession: setSessionMock,
      signOut: signOutMock,
    },
  }),
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
  WebBrowserResultType: { DISMISS: 'dismiss', CANCEL: 'cancel' },
}))

const { completeGoogleAuthFromUrl } = await import('@/lib/google-auth')

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
