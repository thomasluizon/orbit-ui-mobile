import { cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NextRequest } from 'next/server'
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'
import { GET as startApple } from '@/app/api/auth/apple/start/route'
import { GET as startGoogle } from '@/app/api/auth/google/start/route'
import { APPLE_OAUTH_COOKIE, appleOAuthAttemptSchema } from '@/lib/apple-oauth-cookie'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { AuthCallbackContent } from '@/app/(auth)/auth-callback/auth-callback-content'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { installWebLocks } from '../helpers/web-locks'

const server = vi.hoisted(() => ({ cookies: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: server.cookies }))

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}))

const fetchMock = vi.fn<typeof fetch>()
const loginResponse = { userId: 'callback-user', name: 'Person', email: 'person@example.test', wasReactivated: false }

function mount(children: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>)
}

beforeEach(async () => {
  vi.clearAllMocks()
  installWebLocks()
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.setState(useAuthStore.getInitialState())
  await useOnboardingDraftStore.persist.rehydrate()
  sessionStorage.clear()
  fetchMock.mockImplementation(async (url) => {
    if (url === `https://api.example.test${API.auth.appleStart}`) {
      return Response.json({ authorizationUrl: 'https://appleid.apple.com/auth/authorize' })
    }
    if (url === API.profile.get) return new Response(JSON.stringify(createMockProfile()))
    if (url === '/api/auth/google/code' || url === API.auth.appleHandoff || url === '/api/auth/verify-code') {
      return new Response(JSON.stringify(loginResponse))
    }
    throw new Error('Unexpected authentication request')
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('provider ownership across the callback server and client', () => {
  beforeEach(() => {
    vi.stubEnv('API_BASE', 'https://api.example.test')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'apple-client')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'google-client')
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app')
  })

  async function appleAttempt(concurrentGoogle: boolean) {
    const started = await startApple(new NextRequest('https://app.useorbit.org/api/auth/apple/start'))
    const pending = started.cookies.get(APPLE_OAUTH_COOKIE)!
    const { state } = appleOAuthAttemptSchema.parse(JSON.parse(pending.value))
    const cookieHeaders = [`${APPLE_OAUTH_COOKIE}=${encodeURIComponent(pending.value)}`]
    if (concurrentGoogle) {
      const google = startGoogle(new NextRequest('https://app.useorbit.org/api/auth/google/start?purpose=signin'))
      const googleCookie = google.cookies.get(GOOGLE_OAUTH_COOKIE)!
      cookieHeaders.push(`${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(googleCookie.value)}`)
    }
    const callbackRequest = new NextRequest('https://app.useorbit.org/auth-callback', {
      headers: { cookie: cookieHeaders.join('; ') },
    })
    server.cookies.mockResolvedValue(callbackRequest.cookies)
    fetchMock.mockClear()
    return state
  }

  it.each([
    [false, 'Desktop'], [true, 'Desktop'], [false, 'Android'], [true, 'Android'],
  ])('completes a fragment Apple web attempt with concurrent Google=%s on %s', async (concurrentGoogle, userAgent) => {
    const state = await appleAttempt(concurrentGoogle)
    window.history.replaceState(null, '', `/auth-callback#provider=apple&handoff=h&state=${state}`)
    const browserLocation = window.location
    const assign = vi.fn()
    vi.stubGlobal('navigator', { userAgent, locks: navigator.locks })
    vi.stubGlobal('location', {
      protocol: 'https:', host: 'app.useorbit.org',
      get search() { return browserLocation.search },
      get hash() { return browserLocation.hash }, assign,
    })
    sessionStorage.setItem('auth_return_url', '/calendar?import=1')

    mount(await AuthCallbackPage())

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/calendar?import=1'))
    expect(fetchMock).toHaveBeenCalledWith(API.auth.appleHandoff, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ handoff: 'h', state }),
    }))
    expect(useAuthStore.getState().user?.userId).toBe(loginResponse.userId)
    expect(assign).not.toHaveBeenCalled()
    expect(browserLocation.search).toBe('')
    expect(browserLocation.hash).toBe('')
  })
})

describe('callback query ownership with the real login child', () => {
  it.each([
    ['google', 'code=c&state=s', '/api/auth/google/code', { code: 'c', state: 's', language: 'en' }],
    ['google', 'code=123456&email=person%40example.test&state=s', '/api/auth/google/code', { code: '123456', state: 's', language: 'en' }],
    ['apple', 'provider=apple&handoff=h&state=s', '/api/auth/apple/handoff', { handoff: 'h', state: 's' }],
  ] as const)('exchanges the %s callback without navigating to login', async (_provider, query, endpoint, body) => {
    window.history.replaceState(null, '', `/auth-callback?${query}`)
    mount(<AuthCallbackContent pendingWebStates={{ apple: 's', google: 's' }} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      method: 'POST', body: JSON.stringify(body),
    })))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/'))
    expect(window.location.pathname).toBe('/auth-callback')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/verify-code')).toBe(false)
  })

  it('still consumes and verifies an email link on login', async () => {
    window.history.replaceState(null, '', '/login?email=person%40example.test&code=123456&returnUrl=%2Fcalendar')
    mount(<LoginContent />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/verify-code', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'person@example.test', code: '123456', language: 'en' }),
    })))
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/calendar'))
    expect(window.location.pathname).toBe('/login')
    expect(window.location.search).toBe('?returnUrl=%2Fcalendar')
  })
})
