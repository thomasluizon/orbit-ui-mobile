import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setAuth: vi.fn(), push: vi.fn(), replace: vi.fn(), generation: 0 }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (store: { setAuth: typeof mocks.setAuth }) => unknown) => selector({ setAuth: mocks.setAuth }),
  withCookieSettingLogin: (task: () => Promise<unknown>) => task(),
  getAccountGeneration: () => mocks.generation,
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
    mocks.generation = 0
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.clear()
    window.history.replaceState(null, '', '/auth-callback')
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

  it.each(['access_denied', 'cancel', 'dismiss'])('returns to calendar after consent %s', async (error) => {
    window.history.replaceState(null, '', `/auth-callback?error=${error}&state=oauth-state`)
    sessionStorage.setItem('auth_return_url', '/calendar-sync')
    fetchMock.mockResolvedValue({ ok: true })
    render(<AuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/calendar-sync'))
    expect(mocks.replace).not.toHaveBeenCalledWith('/login?googleError=1')
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
    if (query.includes('state=')) {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/code?state=oauth-state', { method: 'DELETE' })
    } else {
      expect(fetchMock).not.toHaveBeenCalled()
    }
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
