import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SecureStore from 'expo-secure-store'
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

function renderPendingSession(
  useSession: () => PendingSession = usePendingGoogleAuthSession,
): { current: PendingSession } {
  const ref: { current: PendingSession | null } = { current: null }

  function Harness() {
    ref.current = useSession()
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
  beforeEach(async () => {
    await clearPendingGoogleAuthSession()
  })

  it('starts idle with no callback url', () => {
    const session = renderPendingSession()
    expect(session.current).toEqual({ callbackUrl: null, isPending: false, returnUrlAttemptId: null })
  })

  it('marks the session pending then resolves it with the callback url', async () => {
    const session = renderPendingSession()

    await TestRenderer.act(async () => { await markPendingGoogleAuthSession('attempt-1') })
    expect(session.current).toEqual({ callbackUrl: null, isPending: true, returnUrlAttemptId: 'attempt-1' })

    const callbackUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#token=1`
    await TestRenderer.act(async () => {
      expect(await setPendingGoogleAuthCallbackUrl(callbackUrl, 'attempt-1')).toBe(true)
    })
    expect(session.current).toEqual({ callbackUrl, isPending: false, returnUrlAttemptId: 'attempt-1' })
  })

  it('clears an active session and no-ops when already idle', async () => {
    const session = renderPendingSession()

    await TestRenderer.act(async () => { await markPendingGoogleAuthSession('attempt-1') })
    await TestRenderer.act(async () => { await clearPendingGoogleAuthSession() })
    expect(session.current).toEqual({ callbackUrl: null, isPending: false, returnUrlAttemptId: null })

    const snapshotBefore = session.current
    await TestRenderer.act(async () => { await clearPendingGoogleAuthSession() })
    expect(session.current).toBe(snapshotBefore)
  })

  it('recovers a single matching callback after process recreation', async () => {
    await markPendingGoogleAuthSession('attempt-1')
    const callbackUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#access_token=fresh&refresh_token=fresh-refresh`

    expect(await SecureStore.getItemAsync('google_auth_attempt')).not.toBeNull()
    vi.resetModules()
    const recreated = await import('@/lib/google-auth-callback')

    expect(await recreated.setPendingGoogleAuthCallbackUrl(callbackUrl)).toBe(true)
    expect(await SecureStore.getItemAsync('google_auth_attempt')).toBeNull()
    expect(await recreated.setPendingGoogleAuthCallbackUrl(callbackUrl)).toBe(false)
  })

  it('mints a live return URL attempt for a callback recovered after process recreation', async () => {
    await markPendingGoogleAuthSession('attempt-1')
    const callbackUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#access_token=fresh&refresh_token=fresh-refresh`
    vi.resetModules()
    const recreated = await import('@/lib/google-auth-callback')
    const authFlow = await import('@/lib/auth-flow')

    expect(await recreated.setPendingGoogleAuthCallbackUrl(callbackUrl)).toBe(true)
    const session = renderPendingSession(recreated.usePendingGoogleAuthSession)
    expect(session.current.returnUrlAttemptId).not.toBeNull()
    expect(authFlow.isAuthReturnUrlAttemptCurrent(session.current.returnUrlAttemptId as string)).toBe(true)
  })

  it('keeps the current attempt when a foreign callback arrives', async () => {
    await markPendingGoogleAuthSession('attempt-1')
    const foreignUrl = `${AUTH_CALLBACK_URL}?authAttempt=foreign#access_token=old`
    const currentUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#access_token=fresh`

    expect(await setPendingGoogleAuthCallbackUrl(foreignUrl)).toBe(false)
    expect(await setPendingGoogleAuthCallbackUrl(currentUrl)).toBe(true)
  })

  it('refuses an expired callback and deletes its marker', async () => {
    await markPendingGoogleAuthSession('attempt-1')
    const callbackUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#access_token=old`
    await SecureStore.setItemAsync('google_auth_attempt', `${Date.now() - 11 * 60 * 1000}:attempt-1`)

    expect(await setPendingGoogleAuthCallbackUrl(callbackUrl)).toBe(false)
    expect(await SecureStore.getItemAsync('google_auth_attempt')).toBeNull()
  })

  it('preserves a newer pending session when an older Google flow settles', async () => {
    const session = renderPendingSession()
    await TestRenderer.act(async () => { await markPendingGoogleAuthSession('attempt-1') })
    await TestRenderer.act(async () => { await markPendingGoogleAuthSession('attempt-2') })
    const oldUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-1#token=old`
    await TestRenderer.act(async () => {
      expect(await setPendingGoogleAuthCallbackUrl(oldUrl, 'attempt-1')).toBe(false)
    })
    await TestRenderer.act(async () => { await clearPendingGoogleAuthSession('attempt-1') })
    expect(session.current).toEqual({ callbackUrl: null, isPending: true, returnUrlAttemptId: 'attempt-2' })

    const newUrl = `${AUTH_CALLBACK_URL}?authAttempt=attempt-2#token=new`
    await TestRenderer.act(async () => {
      expect(await setPendingGoogleAuthCallbackUrl(newUrl, 'attempt-2')).toBe(true)
    })
    expect(session.current).toEqual({ callbackUrl: newUrl, isPending: false, returnUrlAttemptId: 'attempt-2' })
  })
})
