import { afterEach, expect, it, vi } from 'vitest'
import { installWebLocks } from '../helpers/web-locks'

/** Both tab graphs and logout's lazy producer finish loading before the timed cookie operations. */
const firstTab = await import('@/stores/auth-store')
vi.resetModules()
const secondTab = await import('@/app/(auth)/login/login-form-helpers')
await import('@/hooks/use-push-notification-preferences')

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('location', { href: '/' })
let releaseLogout: (() => void) | undefined
const cookieWrites: Promise<unknown>[] = []

afterEach(async () => {
  try {
    releaseLogout?.()
    await Promise.all(cookieWrites)
  } finally {
    Reflect.deleteProperty(navigator, 'locks')
    mockFetch.mockReset()
    vi.unstubAllGlobals()
    vi.resetModules()
  }
})

it('serializes logout and replacement login cookie writes across tabs', async () => {
  installWebLocks()
  const logoutReleased = new Promise<void>((resolve) => {
    releaseLogout = resolve
  })

  const browserCookies = new Map<string, string>([
    ['auth_token', 'old-access'], ['refresh_token', 'old-refresh'],
  ])
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/auth/logout') {
      return logoutReleased.then(() => {
        browserCookies.clear()
        return Response.json({ success: true })
      })
    }
    if (url === '/api/auth/verify-code') {
      browserCookies.set('auth_token', 'new-access')
      browserCookies.set('refresh_token', 'new-refresh')
      return Promise.resolve(Response.json({
        userId: 'new-user', name: 'New', email: 'new@example.com',
      }))
    }
    throw new Error(`Unexpected auth endpoint: ${url}`)
  })

  firstTab.useAuthStore.getState().setAuth({
    userId: 'old-user', name: 'Old', email: 'old@example.com',
  })
  const oldLogout = firstTab.useAuthStore.getState().logout()
  cookieWrites.push(oldLogout)
  await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST', headers: expect.any(Headers) }))

  const replacementLogin = secondTab.fetchAuthEndpoint('/api/auth/verify-code', {
    email: 'new@example.com', code: '123456',
  })
  cookieWrites.push(replacementLogin)
  await new Promise((resolve) => setTimeout(resolve, 0))
  releaseLogout?.()
  await Promise.all([oldLogout, replacementLogin])

  expect(browserCookies.get('auth_token')).toBe('new-access')
  expect(browserCookies.get('refresh_token')).toBe('new-refresh')
})
