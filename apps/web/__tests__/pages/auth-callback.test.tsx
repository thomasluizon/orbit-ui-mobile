import AuthLayout from '@/app/(auth)/layout'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import type { ErrorEvent } from '@sentry/nextjs'
import { beforeSendEvent } from '@/lib/sentry-scrub'

const mocks = vi.hoisted(() => ({ setAuth: vi.fn(), push: vi.fn(), replace: vi.fn(), generation: 0,
  hydrateProfilePresentation: vi.fn(), captureMessage: vi.fn(),
  continueAccount: null as null | (() => void) }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('@sentry/nextjs', async (original) => ({ ...await original<typeof import('@sentry/nextjs')>(), captureMessage: mocks.captureMessage }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/auth-callback',
  useSearchParams: () => new URLSearchParams(globalThis.location.search),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: (state: { setAuth: typeof mocks.setAuth; isAuthenticated: boolean; sessionInactive: boolean }) => unknown) => {
    const state = { setAuth: mocks.setAuth, isAuthenticated: false, sessionInactive: false }
    return selector ? selector(state) : state
  },
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
}))
vi.mock('@/app/(auth)/login/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string; onContinue: () => void } }) => {
    mocks.continueAccount = callback.onContinue
    return <div data-testid="callback-state">{callback.state}</div>
  },
}))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => mocks.generation }))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: mocks.hydrateProfilePresentation }))
import { AuthCallbackContent } from '@/app/(auth)/auth-callback/auth-callback-content'

const fetchMock = vi.fn()

describe('Google code callback', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  beforeEach(async () => {
    await useOnboardingDraftStore.persist.rehydrate()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    mocks.setAuth.mockReset().mockImplementation(() => { mocks.generation += 1 })
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.hydrateProfilePresentation.mockReset().mockResolvedValue(undefined)
    mocks.captureMessage.mockReset()
    fetchMock.mockReset()
    mocks.generation = 0
    mocks.continueAccount = null
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
  })

  it.each([['app.useorbit.org', 'org.useorbit.app'], ['app-staging.useorbit.org', 'org.useorbit.app.staging']])
  ('hands an Android callback with an unknown state to %s', async (host, packageName) => {
    const query = '?code=mobile%2Bcode&state=mobile-state&scope=openid+email&scope=profile&authuser=1'
    const assign = vi.fn()
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', packageName)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0' })
    vi.stubGlobal('location', { protocol: 'https:', host, search: query, assign })
    fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith(
      `intent://${host}/auth-callback${query}#Intent;scheme=https;package=${packageName};end`,
    ))
    expect(screen.getByRole('link', { name: 'auth.openInOrbit' })).toHaveAttribute('href',
      `intent://${host}/auth-callback${query}#Intent;scheme=https;package=${packageName};end`)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('mobile+code')
    expect(assign).toHaveBeenCalledOnce()
  })

  it.each(['?', '#'])('rejects an Apple state mismatch from %s before exchanging a handoff', async (separator) => {
    window.history.replaceState(null, '', `/auth-callback${separator}provider=apple&handoff=one-use&state=wrong-state`)
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'apple', reason: 'state_mismatch' },
    })
  })

  it('clears Apple fragment credentials before opening the Android intent', async () => {
    const assign = vi.fn(() => {
      expect(window.location.search).toBe('')
      expect(window.location.hash).toBe('')
    })
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app')
    vi.stubGlobal('navigator', { userAgent: 'Android' })
    window.history.replaceState(null, '', '/auth-callback#provider=apple&handoff=h&state=mobile-state')
    const browserLocation = window.location
    vi.stubGlobal('location', {
      protocol: 'https:', host: 'app.useorbit.org',
      get search() { return browserLocation.search },
      get hash() { return browserLocation.hash }, assign,
    })
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(
      'intent://app.useorbit.org/auth-callback?provider=apple&handoff=h&state=mobile-state#Intent;scheme=https;package=org.useorbit.app;end',
    ))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses fragment values before query values and clears the URL before the Apple request', async () => {
    window.history.replaceState(null, '', '/auth-callback?provider=google&handoff=old&state=old#provider=apple&handoff=one-use&state=expected-state')
    fetchMock.mockImplementation(() => {
      expect(window.location.search).toBe('')
      expect(window.location.hash).toBe('')
      return Promise.resolve(Response.json({ userId: 'user-1', name: 'Person', email: 'person@example.test' }))
    })
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/apple/handoff', expect.objectContaining({ body: JSON.stringify({ handoff: 'one-use', state: 'expected-state' }) }))
  })

  it.each(['state=expected-state&state=expected-state&handoff=h', 'state=expected-state&handoff=h&handoff=h'])('rejects duplicate Apple fragment credentials: %s', async (fragment) => {
    window.history.replaceState(null, '', `/auth-callback#provider=apple&${fragment}`)
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledWith('auth_callback_failed', expect.objectContaining({ tags: { provider: 'apple', reason: 'state_mismatch' } }))
  })

  it.each([['?', false], ['?', true], ['#', false], ['#', true]] as const)('exchanges a matching Apple handoff from %s and signs in, reactivated=%s', async (separator, reactivated) => {
    window.history.replaceState(null, '', `/auth-callback${separator}provider=apple&handoff=one-use&state=expected-state`)
    sessionStorage.setItem('auth_return_url', '/')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'Person', email: 'person@example.test', wasReactivated: reactivated })))
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    if (reactivated) {
      await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))
      await act(async () => { mocks.continueAccount?.() })
    }
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/apple/handoff', expect.objectContaining({ body: JSON.stringify({ handoff: 'one-use', state: 'expected-state' }) }))
    expect(mocks.setAuth).toHaveBeenCalledOnce()
    expect(mocks.captureMessage).not.toHaveBeenCalled()
    expect(mocks.generation).toBe(1)
    expect(sessionStorage.getItem('auth_return_url')).toBeNull()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
  })

  it.each([
    ['apple', false], ['apple', true], ['google', false], ['google', true],
  ] as const)('keeps a replacement session and return URL during %s profile hydration, reactivated=%s', async (provider, reactivated) => {
    const query = provider === 'apple' ? 'provider=apple&handoff=one-use' : 'code=google-code'
    window.history.replaceState(null, '', `/auth-callback?${query}&state=expected-state`)
    sessionStorage.setItem('auth_return_url', '/older')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'Person',
      email: 'person@example.test', wasReactivated: reactivated })))
    let release!: () => void
    mocks.hydrateProfilePresentation.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    if (reactivated) {
      await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))
      await act(async () => { mocks.continueAccount?.() })
    }
    await waitFor(() => expect(mocks.hydrateProfilePresentation).toHaveBeenCalledOnce())
    expect(mocks.generation).toBe(1)
    mocks.generation += 1
    sessionStorage.setItem('auth_return_url', '/newer')
    await act(async () => { release() })
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('auth_return_url')).toBe('/newer')
  })

  it.each(['apple', 'google'] as const)('exchanges a web-owned Android %s callback using its own pending state', async (provider) => {
    const assign = vi.fn()
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app')
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0' })
    const query = provider === 'apple' ? '?provider=apple&handoff=web-handoff&state=apple-state' : '?code=web-code&state=google-state'
    vi.stubGlobal('location', { protocol: 'https:', host: 'app.useorbit.org', search: query, assign })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'A', email: 'a@example.com' })))
    render(<AuthCallbackContent pendingWebStates={{ apple: 'apple-state', google: 'google-state' }} />)

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
    expect(fetchMock).toHaveBeenCalledWith(provider === 'apple' ? '/api/auth/apple/handoff' : '/api/auth/google/code', expect.objectContaining({
      body: JSON.stringify(provider === 'apple' ? { handoff: 'web-handoff', state: 'apple-state' }
        : { code: 'web-code', state: 'google-state', language: 'pt-BR' }),
    }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'auth.openInOrbit' })).not.toBeInTheDocument()
  })

  it.each(['apple', 'google'] as const)('forwards an Android %s callback whose state belongs only to the other provider', async (provider) => {
    const assign = vi.fn()
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app')
    vi.stubGlobal('navigator', { userAgent: 'Android' })
    const query = provider === 'apple' ? '?provider=apple&handoff=app-handoff&state=google-state' : '?code=app-code&state=apple-state'
    vi.stubGlobal('location', { protocol: 'https:', host: 'app.useorbit.org', search: query, assign })
    render(<AuthCallbackContent pendingWebStates={{ apple: 'apple-state', google: 'google-state' }} />)

    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(
      `intent://app.useorbit.org/auth-callback${query}#Intent;scheme=https;package=org.useorbit.app;end`,
    ))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })

  it('returns Android consent denial to the app without clearing a different web attempt', async () => {
    const assign = vi.fn()
    vi.stubEnv('NEXT_PUBLIC_PLAY_PACKAGE_NAME', 'org.useorbit.app.staging')
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/130.0' })
    const query = '?error=access_denied&state=mobile-state&error_description=User+cancelled'
    vi.stubGlobal('location', { protocol: 'https:', host: 'app-staging.useorbit.org', search: query, assign })
    render(<AuthCallbackContent pendingWebStates={{ apple: 'older-web-state', google: 'older-web-state' }} />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith(
      `intent://app-staging.useorbit.org/auth-callback${query}#Intent;scheme=https;package=org.useorbit.app.staging;end`,
    ))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows upgrade guidance in the auth layout when Google returns 426', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    fetchMock.mockResolvedValue(new Response(null, { status: 426 }))
    render(<AuthLayout><AuthCallbackContent pendingWebStates={{ apple: null, google: null }} /></AuthLayout>)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('forceUpdate.banner'))
    expect(screen.getByRole('button', { name: 'forceUpdate.refresh' })).toBeEnabled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'google', reason: 'exchange_failed' },
    })
  })

  it('leaves a replacement session untouched when the response body arrives late', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    let releaseBody!: (value: unknown) => void
    fetchMock.mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { releaseBody = resolve }) })
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    mocks.generation += 1
    await act(async () => {
      releaseBody({ userId: 'old-user', name: 'Old', email: 'old@example.com' })
    })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'google', reason: 'session_changed' },
    })
  })

  it.each(['logout', 'replacement login'])('does not continue a reactivated callback after %s', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'old-user', name: 'Old',
      email: 'old@example.com', wasReactivated: true }), { status: 200 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))

    mocks.generation += 1
    await act(async () => { mocks.continueAccount?.() })

    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each(['/calendar?import=1', '/calendar?mode=review'])('returns a reactivated account to %s', async (returnUrl) => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    sessionStorage.setItem('auth_return_url', returnUrl)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'A',
      email: 'a@example.com', wasReactivated: true }), { status: 200 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))
    await act(async () => { mocks.continueAccount?.() })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(returnUrl))
    expect(sessionStorage.getItem('auth_return_url')).toBeNull()
  })

  it.each(['access_denied', 'cancel', 'dismiss'])('returns to calendar after consent %s', async (error) => {
    window.history.replaceState(null, '', `/auth-callback?error=${error}&state=oauth-state`)
    sessionStorage.setItem('auth_return_url', '/calendar?import=1')
    fetchMock.mockResolvedValue({ ok: true })
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/calendar?import=1'))
    expect(mocks.replace).not.toHaveBeenCalledWith('/login?googleError=1')
  })

  it('posts the code and state then navigates to the saved destination', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    sessionStorage.setItem('auth_return_url', '/calendar?import=1')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'A', email: 'a@example.com' }), { status: 200 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code', expect.objectContaining({
      body: JSON.stringify({ code: 'google-code', state: 'oauth-state', language: 'pt-BR' }),
    }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/calendar?import=1'))
  })

  it.each(['?error=access_denied&state=oauth-state', '?code=google-code'])('shows a visible error for invalid callback %s', async (query) => {
    window.history.replaceState(null, '', `/auth-callback${query}`)
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    if (query.includes('state=')) {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code?state=oauth-state', { method: 'DELETE', headers: expect.any(Headers) })
    } else {
      expect(fetchMock).not.toHaveBeenCalled()
    }
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows a visible error when the API rejects the code', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=bad&state=oauth-state')
    fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))
    render(<AuthCallbackContent pendingWebStates={{ apple: null, google: null }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'google', reason: 'exchange_failed' },
    })
  })

  it.each([
    ['state=private-state', 'missing_code'],
    ['code=private-code', 'missing_state'],
    ['error=private-provider-content&code=private-code&state=private-state', 'provider_error'],
  ])('reports one fixed reason for invalid input %s under effect replay', async (query, reason) => {
    window.history.replaceState(null, '', `/auth-callback?${query}`)
    fetchMock.mockResolvedValue(new Response('{}'))
    render(<StrictMode><AuthCallbackContent pendingWebStates={{ apple: null, google: null }} /></StrictMode>)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'google', reason },
    })
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain('private-')
  })

  it.each([false, true])('scrubs the completed cleanup breadcrumb before reporting, rejected=%s', async (rejected) => {
    window.history.replaceState(null, '', '/auth-callback?error=private-error&code=private-code&state=private-state&handoff=private-handoff')
    const breadcrumbs: NonNullable<ErrorEvent['breadcrumbs']> = []
    const captured: ErrorEvent[] = []
    fetchMock.mockImplementationOnce(async (url: string, options: RequestInit) => {
      breadcrumbs.push({ category: 'fetch', type: 'http', level: rejected ? 'error' : 'info',
        data: { method: options.method, url, ...(rejected ? {} : { status_code: 200 }) } })
      if (rejected) throw new Error('cleanup unavailable')
      return new Response('{}')
    })
    mocks.captureMessage.mockImplementationOnce((message, context) => {
      const event = beforeSendEvent({ type: undefined, message, ...context,
        request: { url: window.location.href }, transaction: window.location.pathname + window.location.search,
        breadcrumbs }, {})
      if (event) captured.push(event)
    })
    render(<StrictMode><AuthCallbackContent pendingWebStates={{ apple: null, google: null }} /></StrictMode>)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/google/code?state=private-state', expect.objectContaining({ method: 'DELETE' }))
    expect(captured).toHaveLength(1)
    expect(captured[0]?.breadcrumbs).toEqual([expect.objectContaining({
      category: 'fetch', data: expect.objectContaining({ method: 'DELETE', url: '/api/auth/google/code' }),
    })])
    expect(captured[0]?.tags).toEqual({ provider: 'google', reason: 'provider_error' })
    expect(JSON.stringify(captured)).not.toContain('private-')
  })

  it('reports hydration failure when continuing a reactivated account', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=secret&state=expected-state')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', wasReactivated: true })))
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))
    mocks.hydrateProfilePresentation.mockRejectedValueOnce(new Error('private profile content'))
    await act(async () => { mocks.continueAccount?.() })
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'google', reason: 'profile_hydration_failed' },
    })
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each(['apple', 'google'])('reports profile hydration failure once for %s', async (provider) => {
    const query = provider === 'apple' ? 'provider=apple&handoff=secret' : 'code=secret'
    window.history.replaceState(null, '', `/auth-callback?${query}&state=expected-state`)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'Person', email: 'private@example.test' })))
    mocks.hydrateProfilePresentation.mockRejectedValue(new Error('private profile content'))
    render(<AuthCallbackContent pendingWebStates={{ apple: 'expected-state', google: 'expected-state' }} />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider, reason: 'profile_hydration_failed' },
    })
  })
})
