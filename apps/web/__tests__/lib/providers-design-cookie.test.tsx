import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { installWebLocks } from '../helpers/web-locks'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reload: vi.fn() }))
vi.mock('@/lib/api-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-fetch')>(),
  sessionAwareFetch: mocks.fetch,
}))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

async function mount() {
  const { Providers } = await import('@/lib/providers')
  const view = render(<StrictMode><Providers><div>Account</div></Providers></StrictMode>)
  return { ...view, Providers }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  installWebLocks()
  localStorage.clear()
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
  document.cookie = 'unrelated=; Max-Age=0; Path=/'
  vi.stubGlobal('location', { href: '/', reload: mocks.reload })
})

afterEach(async () => {
  cleanup()
  const { getQueryClient } = await import('@/lib/query-client')
  getQueryClient().clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
  document.cookie = 'unrelated=; Max-Age=0; Path=/'
})

describe('stale design cookie cleanup through Providers', () => {
  it('clears the stale cookie on the next visit without account config or a reload', async () => {
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    document.cookie = 'unrelated=retained; Path=/'
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    await mount()

    expect(document.cookie).not.toContain('orbit_design=')
    expect(document.cookie).toContain('unrelated=retained')
    expect(cookieWrites).toHaveBeenCalledExactlyOnceWith('orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax')
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it('leaves a browser without the cookie unchanged across renders and remounts', async () => {
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    const { rerender, unmount, Providers } = await mount()
    rerender(<Providers><div>Updated</div></Providers>)
    unmount()
    render(<Providers><div>Remounted</div></Providers>)

    expect(screen.getByText('Remounted')).toBeInTheDocument()
    expect(cookieWrites).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it.each(['success', 'network failure'])('keeps account-reset cleanup after a BFF %s', async (outcome) => {
    vi.stubGlobal('fetch', outcome === 'success'
      ? vi.fn(async () => new Response(null, { status: 204 }))
      : vi.fn(async () => { throw new TypeError('offline') }))
    await mount()
    const { useAuthStore } = await import('@/stores/auth-store')
    act(() => useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Account', email: 'account@example.com' }))
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'

    await act(async () => { await useAuthStore.getState().logout() })

    expect(document.cookie).not.toContain('orbit_design=')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mocks.reload).not.toHaveBeenCalled()
    expect(globalThis.location.href).toBe('/login')
  })
})
