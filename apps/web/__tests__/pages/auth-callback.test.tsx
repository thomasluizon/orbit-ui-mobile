import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setAuth: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ setAuth: mocks.setAuth }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
}))
vi.mock('@/app/(auth)/login/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string } }) =>
    <div data-testid="callback-state">{callback.state}</div>,
}))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: () => Promise.resolve() }))
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'

const fetchMock = vi.fn()

describe('Google code callback', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    mocks.setAuth.mockReset()
    mocks.push.mockReset()
    mocks.replace.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
  })

  it('posts the code and state then navigates to the saved destination', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=google-code&state=oauth-state')
    sessionStorage.setItem('auth_return_url', '/calendar-sync')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userId: 'user-1', name: 'A', email: 'a@example.com' }), { status: 200 }))
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code', expect.objectContaining({
      body: JSON.stringify({ code: 'google-code', state: 'oauth-state', language: 'pt-BR' }),
    }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/calendar-sync'))
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
