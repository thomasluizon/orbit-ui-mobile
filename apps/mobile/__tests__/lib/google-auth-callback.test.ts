import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_URL,
  clearPendingGoogleAuthSession,
  extractGoogleAuthParams,
  markPendingGoogleAuthSession,
  setPendingGoogleAuthCallbackUrl,
  usePendingGoogleAuthSession,
} from '@/lib/google-auth-callback'

const TestRenderer = require('react-test-renderer')

type PendingSession = ReturnType<typeof usePendingGoogleAuthSession>

function renderPendingSession(): { current: PendingSession } {
  const ref: { current: PendingSession | null } = { current: null }

  function Harness() {
    ref.current = usePendingGoogleAuthSession()
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Harness))
  })

  if (!ref.current) throw new Error('usePendingGoogleAuthSession did not render')
  return ref as { current: PendingSession }
}

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
  })

  it('detects callback error params from the query string', () => {
    const url = `${AUTH_CALLBACK_URL}?error=access_denied&error_description=User%20cancelled`
    const params = extractGoogleAuthParams(url)

    expect(params.error).toBe('access_denied')
    expect(params.error_description).toBe('User cancelled')
  })

  it('detects direct backend token payloads', () => {
    const params = extractGoogleAuthParams(
      `${AUTH_CALLBACK_URL}?token=backend-token&refreshToken=refresh-token&userId=user-1&name=Thomas&email=thomas%40example.com`,
    )

    expect(params.token).toBe('backend-token')
    expect(params.refreshToken).toBe('refresh-token')
    expect(params.userId).toBe('user-1')
  })

  it('detects supabase access and refresh tokens from the hash fragment', () => {
    const url = `${AUTH_CALLBACK_URL}#access_token=supa-access&refresh_token=supa-refresh`
    const params = extractGoogleAuthParams(url)

    expect(params.access_token).toBe('supa-access')
    expect(params.refresh_token).toBe('supa-refresh')
  })

  it('detects native callback URLs with payloads', () => {
    const url = `${nativeCallbackUrl}#access_token=supa-access&refresh_token=supa-refresh`

    expect(extractGoogleAuthParams(url).access_token).toBe('supa-access')
  })
})

describe('pending google auth session store', () => {
  beforeEach(() => {
    clearPendingGoogleAuthSession()
  })

  it('starts idle with no callback url', () => {
    const session = renderPendingSession()
    expect(session.current).toEqual({ callbackUrl: null, isPending: false })
  })

  it('marks the session pending then resolves it with the callback url', () => {
    const session = renderPendingSession()

    TestRenderer.act(() => markPendingGoogleAuthSession())
    expect(session.current).toEqual({ callbackUrl: null, isPending: true })

    TestRenderer.act(() => setPendingGoogleAuthCallbackUrl('orbit://cb#token=1'))
    expect(session.current).toEqual({ callbackUrl: 'orbit://cb#token=1', isPending: false })
  })

  it('clears an active session and no-ops when already idle', () => {
    const session = renderPendingSession()

    TestRenderer.act(() => markPendingGoogleAuthSession())
    TestRenderer.act(() => clearPendingGoogleAuthSession())
    expect(session.current).toEqual({ callbackUrl: null, isPending: false })

    const snapshotBefore = session.current
    TestRenderer.act(() => clearPendingGoogleAuthSession())
    expect(session.current).toBe(snapshotBefore)
  })
})
