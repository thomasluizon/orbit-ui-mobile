import { cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { AuthCallbackContent } from '@/app/(auth)/auth-callback/auth-callback-content'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { installWebLocks } from '../helpers/web-locks'

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
    if (url === API.profile.get) return new Response(JSON.stringify(createMockProfile()))
    if (url === '/api/auth/google/code' || url === API.auth.appleHandoff || url === '/api/auth/verify-code') {
      return new Response(JSON.stringify(loginResponse))
    }
    throw new Error('Unexpected authentication request')
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('callback query ownership with the real login child', () => {
  it.each([
    ['google', 'code=c&state=s', '/api/auth/google/code', { code: 'c', state: 's', language: 'en' }],
    ['google', 'code=123456&email=person%40example.test&state=s', '/api/auth/google/code', { code: '123456', state: 's', language: 'en' }],
    ['apple', 'provider=apple&handoff=h&state=s', '/api/auth/apple/handoff', { handoff: 'h', state: 's' }],
  ] as const)('exchanges the %s callback without navigating to login', async (_provider, query, endpoint, body) => {
    window.history.replaceState(null, '', `/auth-callback?${query}`)
    mount(<AuthCallbackContent pendingWebState="s" />)
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
