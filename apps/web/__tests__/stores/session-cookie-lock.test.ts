import { afterEach, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks')
  mockFetch.mockReset()
  vi.resetModules()
})

it('serializes logout and replacement login cookie writes across tabs', async () => {
  let lockQueue: Promise<unknown> = Promise.resolve()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, task: () => Promise<unknown>) => {
        const result = lockQueue.then(task)
        lockQueue = result.catch(() => {})
        return result
      },
    },
  })

  const browserCookies = new Map<string, string>([
    ['auth_token', 'old-access'], ['refresh_token', 'old-refresh'],
  ])
  let releaseLogout!: () => void
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/auth/logout') {
      return new Promise<Response>((resolve) => {
        releaseLogout = () => {
          browserCookies.clear()
          resolve(Response.json({ success: true }))
        }
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

  vi.resetModules()
  const firstTab = await import('@/stores/auth-store')
  firstTab.useAuthStore.getState().setAuth({
    userId: 'old-user', name: 'Old', email: 'old@example.com',
  })
  const oldLogout = firstTab.useAuthStore.getState().logout()
  await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))

  vi.resetModules()
  const secondTab = await import('@/app/(auth)/login/login-form-helpers')
  const replacementLogin = secondTab.fetchAuthEndpoint('/api/auth/verify-code', {
    email: 'new@example.com', code: '123456',
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  releaseLogout()
  await Promise.all([oldLogout, replacementLogin])

  expect(browserCookies.get('auth_token')).toBe('new-access')
  expect(browserCookies.get('refresh_token')).toBe('new-refresh')
})
