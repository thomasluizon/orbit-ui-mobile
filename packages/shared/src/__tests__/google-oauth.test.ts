import { describe, expect, it } from 'vitest'
import { buildGoogleAuthorizeUrl, bytesToHex, GOOGLE_CALENDAR_READONLY_SCOPE } from '../utils/google-oauth'

describe('Google authorization URL', () => {
  const input = {
    clientId: 'configured-client',
    redirectUri: 'https://staging.example/auth-callback',
    state: 'random-state',
    codeChallenge: 'pkce-challenge',
  }

  it.each([
    { purpose: 'signin' as const, scopes: 'openid email profile', calendar: false },
    { purpose: 'calendar' as const, scopes: `openid email profile ${GOOGLE_CALENDAR_READONLY_SCOPE}`, calendar: true },
  ])('builds the $purpose code flow with the intended consent settings', ({ purpose, scopes, calendar }) => {
    const url = new URL(buildGoogleAuthorizeUrl({ ...input, purpose }))
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: scopes,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      ...(calendar ? {
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
      } : {}),
    })
  })

  it('encodes random bytes as fixed-width lowercase hexadecimal for PKCE and state', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 171, 255]))).toBe('00010f10abff')
  })
})
