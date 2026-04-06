import { describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_URL,
  buildGoogleAuthFallbackUrl,
  extractGoogleAuthParams,
  hasGoogleAuthCallbackPayload,
  resolveGoogleAuthCallbackUrl,
} from '@/lib/google-auth-callback'

describe('google auth callback helpers', () => {
  const nativeCallbackUrl = 'orbit://auth-callback'

  it('treats a bare callback route as having no payload', () => {
    const params = extractGoogleAuthParams(AUTH_CALLBACK_URL)

    expect(params).toEqual({
      access_token: undefined,
      refresh_token: undefined,
      provider_token: undefined,
      provider_refresh_token: undefined,
      error: undefined,
      error_description: undefined,
      token: undefined,
      refreshToken: undefined,
      userId: undefined,
      name: undefined,
      email: undefined,
    })
    expect(hasGoogleAuthCallbackPayload(params)).toBe(false)
    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: AUTH_CALLBACK_URL,
        params: {},
      }),
    ).toBeNull()
  })

  it('detects callback error params from the query string', () => {
    const url = `${AUTH_CALLBACK_URL}?error=access_denied&error_description=User%20cancelled`
    const params = extractGoogleAuthParams(url)

    expect(params.error).toBe('access_denied')
    expect(params.error_description).toBe('User cancelled')
    expect(hasGoogleAuthCallbackPayload(params)).toBe(true)
    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: url,
        params: {},
      }),
    ).toBe(url)
  })

  it('detects direct backend token payloads', () => {
    const fallbackUrl = buildGoogleAuthFallbackUrl({
      token: 'backend-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      name: 'Thomas',
      email: 'thomas@example.com',
    })

    expect(fallbackUrl).toBe(
      `${AUTH_CALLBACK_URL}?token=backend-token&refreshToken=refresh-token&userId=user-1&name=Thomas&email=thomas%40example.com`,
    )
    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: null,
        params: {
        token: 'backend-token',
        refreshToken: 'refresh-token',
        userId: 'user-1',
        name: 'Thomas',
        email: 'thomas@example.com',
        },
      }),
    ).toBe(fallbackUrl)
  })

  it('detects supabase access and refresh tokens from the hash fragment', () => {
    const url = `${AUTH_CALLBACK_URL}#access_token=supa-access&refresh_token=supa-refresh`
    const params = extractGoogleAuthParams(url)

    expect(params.access_token).toBe('supa-access')
    expect(params.refresh_token).toBe('supa-refresh')
    expect(hasGoogleAuthCallbackPayload(params)).toBe(true)
    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: url,
        params: {},
      }),
    ).toBe(url)
  })

  it('detects native callback URLs with payloads', () => {
    const url = `${nativeCallbackUrl}#access_token=supa-access&refresh_token=supa-refresh`

    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: url,
        params: {},
      }),
    ).toBe(url)
  })

  it('prefers the auth-session callback URL over route state', () => {
    const sessionUrl = `${nativeCallbackUrl}#access_token=session-access&refresh_token=session-refresh`
    const routeUrl = `${AUTH_CALLBACK_URL}?error=server_error`

    expect(
      resolveGoogleAuthCallbackUrl({
        sessionCallbackUrl: sessionUrl,
        rawUrl: routeUrl,
        params: {
          error: 'server_error',
        },
      }),
    ).toBe(sessionUrl)
  })
})
