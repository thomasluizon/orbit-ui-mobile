import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setAuth: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (store: { setAuth: typeof mocks.setAuth }) => unknown) => selector({ setAuth: mocks.setAuth }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
}))
vi.mock('@/lib/profile-presentation', () => ({ hydrateProfilePresentation: () => Promise.resolve() }))
import AuthCallbackPage from '@/app/(auth)/auth-callback/page'

const fetchMock = vi.fn()

describe('Google code callback', () => {
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
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ userId: 'user-1', name: 'A', email: 'a@example.com' }) })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.setAuth).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code', expect.objectContaining({
      body: JSON.stringify({ code: 'google-code', state: 'oauth-state', language: 'pt-BR' }),
    }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/calendar-sync'))
  })

  it.each(['?error=access_denied&state=oauth-state', '?code=google-code'])('returns to login for invalid callback %s', async (query) => {
    window.history.replaceState(null, '', `/auth-callback${query}`)
    fetchMock.mockResolvedValue({ ok: true })
    render(<AuthCallbackPage />)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code', { method: 'DELETE' })
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?googleError=1'))
  })

  it('returns to login when the API rejects the code', async () => {
    window.history.replaceState(null, '', '/auth-callback?code=bad&state=oauth-state')
    fetchMock.mockResolvedValue({ ok: false })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?googleError=1'))
    expect(mocks.setAuth).not.toHaveBeenCalled()
  })
})
