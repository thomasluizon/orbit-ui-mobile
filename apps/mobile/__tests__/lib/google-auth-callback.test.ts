import React from 'react'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_URL,
  buildGoogleAuthFallbackUrl,
  clearPendingGoogleAuthSession,
  extractGoogleAuthParams,
  hasGoogleAuthCallbackPayload,
  markPendingGoogleAuthSession,
  resolveGoogleAuthCallbackUrl,
  setPendingGoogleAuthCallbackUrl,
  usePendingGoogleAuthSession,
} from '@/lib/google-auth-callback'

const TestRenderer = require('react-test-renderer')
const decoderPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/decode-uri-component/index.js')
const expoParserPath = require.resolve('expo-router/build/react-navigation/core/getStateFromPath')

function parseWithExpoRouter(query: string): { error_description: string } {
  const source = [
    'const decoder = require(process.argv[1]);',
    'const Module = require("node:module");',
    'const originalLoad = Module._load;',
    'Module._load = function (request, parent, isMain) {',
    '  if (request === "decode-uri-component") return decoder;',
    '  return originalLoad.call(this, request, parent, isMain);',
    '};',
    'const { getStateFromPath } = require(process.argv[2]);',
    'const state = getStateFromPath("/auth-callback?error_description=" + process.argv[3]);',
    'process.stdout.write(JSON.stringify(state.routes[0].params));',
  ].join('\n')
  const output = execFileSync(process.execPath, ['-e', source, decoderPath, expoParserPath, query], {
    encoding: 'utf8',
    timeout: 1500,
  })
  return JSON.parse(output) as { error_description: string }
}

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

  it('parses encoded callback params through Expo Router query-string', () => {
    const queryString = require('query-string')

    expect(queryString.parse('error_description=User%20cancelled')).toEqual({
      error_description: 'User cancelled',
    })
  })

  it('decodes ordinary callback params through the CommonJS decoder and Expo Router', () => {
    expect(parseWithExpoRouter('User%20cancelled%20%26%20retry')).toEqual({
      error_description: 'User cancelled & retry',
    })
  })

  it('bounds malformed callback query decoding through Expo Router', () => {
    const malformedValue = '%C3'.repeat(400)
    expect(parseWithExpoRouter(malformedValue)).toEqual({ error_description: malformedValue })
  })

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

  it('returns null when the fallback params carry no payload', () => {
    expect(
      resolveGoogleAuthCallbackUrl({
        rawUrl: `${AUTH_CALLBACK_URL}?state=abc`,
        params: { state: 'abc' },
      }),
    ).toBeNull()
  })

  it('builds no fallback url from an empty param set', () => {
    expect(buildGoogleAuthFallbackUrl({})).toBeNull()
  })

  it('drops array-valued params when building the fallback url', () => {
    const fallbackUrl = buildGoogleAuthFallbackUrl({
      error: 'access_denied',
      scopes: ['a', 'b'],
    })

    expect(fallbackUrl).toBe(`${AUTH_CALLBACK_URL}?error=access_denied`)
  })
})

describe('pending google auth session store', () => {
  beforeEach(() => {
    clearPendingGoogleAuthSession()
  })

  it('starts idle with no callback url', () => {
    const session = renderPendingSession()
    expect(session.current).toEqual({ callbackUrl: null, isPending: false, returnUrlAttemptId: null })
  })

  it('marks the session pending then resolves it with the callback url', () => {
    const session = renderPendingSession()

    TestRenderer.act(() => markPendingGoogleAuthSession(1))
    expect(session.current).toEqual({ callbackUrl: null, isPending: true, returnUrlAttemptId: 1 })

    TestRenderer.act(() => setPendingGoogleAuthCallbackUrl('orbit://cb#token=1', 1))
    expect(session.current).toEqual({ callbackUrl: 'orbit://cb#token=1', isPending: false, returnUrlAttemptId: 1 })
  })

  it('clears an active session and no-ops when already idle', () => {
    const session = renderPendingSession()

    TestRenderer.act(() => markPendingGoogleAuthSession(1))
    TestRenderer.act(() => clearPendingGoogleAuthSession())
    expect(session.current).toEqual({ callbackUrl: null, isPending: false, returnUrlAttemptId: null })

    const snapshotBefore = session.current
    TestRenderer.act(() => clearPendingGoogleAuthSession())
    expect(session.current).toBe(snapshotBefore)
  })

  it('keeps the newer Google attempt when an older browser result settles', () => {
    const session = renderPendingSession()
    TestRenderer.act(() => markPendingGoogleAuthSession(1))
    TestRenderer.act(() => markPendingGoogleAuthSession(2))
    TestRenderer.act(() => setPendingGoogleAuthCallbackUrl('orbit://cb#old', 1))
    TestRenderer.act(() => clearPendingGoogleAuthSession(1))

    expect(session.current).toEqual({ callbackUrl: null, isPending: true, returnUrlAttemptId: 2 })
    TestRenderer.act(() => setPendingGoogleAuthCallbackUrl('orbit://cb#new', 2))
    expect(session.current).toEqual({
      callbackUrl: 'orbit://cb#new', isPending: false, returnUrlAttemptId: 2,
    })
  })
})
