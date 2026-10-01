import AuthLayout from '@/app/(auth)/layout'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setAuth: vi.fn(), push: vi.fn(), replace: vi.fn(), generation: 0,
  continueAccount: null as null | (() => void) }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/auth-callback',
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
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: () => Promise.resolve() }))
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'

const fetchMock = vi.fn()

describe('Google code callback', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(async () => {
    await useOnboardingDraftStore.persist.rehydrate()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    mocks.setAuth.mockReset()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    fetchMock.mockReset()
    mocks.generation = 0
    mocks.continueAccount = null
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
  })

  it('shows upgrade guidance in the auth layout when Google returns 426', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    fetchMock.mockResolvedValue(new Response(null, { status: 426 }))
    render(<AuthLayout><AuthCallbackPage /></AuthLayout>)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('forceUpdate.banner'))
    expect(screen.getByRole('button', { name: 'forceUpdate.refresh' })).toBeEnabled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('leaves a replacement session untouched when the response body arrives late', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    let releaseBody!: (value: unknown) => void
    fetchMock.mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { releaseBody = resolve }) })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    mocks.generation += 1
    await act(async () => {
      releaseBody({ userId: 'old-user', name: 'Old', email: 'old@example.com' })
    })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.setAuth).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each(['logout', 'replacement login'])('does not continue a reactivated callback after %s', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'old-user', name: 'Old',
      email: 'old@example.com', wasReactivated: true }), { status: 200 }))
    render(<AuthCallbackPage />)
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
    render(<AuthCallbackPage />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('account'))
    await act(async () => { mocks.continueAccount?.() })
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(returnUrl))
    expect(sessionStorage.getItem('auth_return_url')).toBeNull()
  })

  it.each(['access_denied', 'cancel', 'dismiss'])('returns to calendar after consent %s', async (error) => {
    window.history.replaceState(null, '', `/auth-callback?error=${error}&state=oauth-state`)
    sessionStorage.setItem('auth_return_url', '/calendar?import=1')
    fetchMock.mockResolvedValue({ ok: true })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/calendar?import=1'))
    expect(mocks.replace).not.toHaveBeenCalledWith('/login?googleError=1')
  })

  it('posts the code and state then navigates to the saved destination', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    sessionStorage.setItem('auth_return_url', '/calendar?import=1')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'A', email: 'a@example.com' }), { status: 200 }))
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code', expect.objectContaining({
      body: JSON.stringify({ code: 'google-code', state: 'oauth-state', language: 'pt-BR' }),
    }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/calendar?import=1'))
  })

  it.each(['?error=access_denied&state=oauth-state', '?code=google-code'])('shows a visible error for invalid callback %s', async (query) => {
    window.history.replaceState(null, '', `/auth-callback${query}`)
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    render(<AuthCallbackPage />)
    if (query.includes('state=')) {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code?state=oauth-state', { method: 'DELETE' })
    } else {
      expect(fetchMock).not.toHaveBeenCalled()
    }
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows a visible error when the API rejects the code', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=bad&state=oauth-state')
    fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))
    render(<AuthCallbackPage />)
    await waitFor(() => expect(screen.getByTestId('callback-state')).toHaveTextContent('failed'))
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })
})
