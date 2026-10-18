import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'
import { installWebLocks } from '../helpers/web-locks'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reload: vi.fn() }))
vi.mock('@/lib/api-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-fetch')>(),
  sessionAwareFetch: mocks.fetch,
}))
vi.mock('@/components/service-worker-bridge', () => ({ ServiceWorkerBridge: () => null }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

function respond(enabled: boolean) {
  mocks.fetch.mockImplementation(async () => Response.json(createMockConfigResponse({
    redesign: { enabled, planRequirement: null },
  })))
}

async function mount() {
  const { Providers } = await import('@/lib/providers')
  const { getQueryClient } = await import('@/lib/query-client')
  const { useAuthStore } = await import('@/stores/auth-store')
  getQueryClient().setDefaultOptions({ queries: { retry: false } })
  const view = render(<StrictMode><Providers><div>Account</div></Providers></StrictMode>)
  return { ...view, useAuthStore, queryClient: getQueryClient(), Providers }
}

function signIn(store: Awaited<ReturnType<typeof mount>>['useAuthStore']) {
  act(() => store.getState().setAuth({ userId: 'account-a', name: 'Account', email: 'account@example.com' }))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.fetch.mockReset()
  installWebLocks()
  localStorage.clear()
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
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
})

describe('design routing through Providers and the account config query', () => {
  it('clears the host-only secure cookie after sign-in before reloading once', async () => {
    respond(false)
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    mocks.reload.mockImplementation(() => expect(document.cookie).not.toContain('orbit_design='))
    const { useAuthStore } = await mount()
    expect(mocks.fetch).not.toHaveBeenCalled()

    signIn(useAuthStore)

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(cookieWrites).toHaveBeenCalledWith('orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax')
  })

  it('keeps the current design when the flag is off', async () => {
    respond(false)
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.fetch).toHaveBeenCalled()
    expect(document.cookie).not.toContain('orbit_design=')
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it('does nothing when the enabled flag already matches the cookie', async () => {
    respond(true)
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.fetch).toHaveBeenCalled()
    expect(cookieWrites).not.toHaveBeenCalled()
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it('switches designs when a flag refresh disables redesign', async () => {
    respond(true)
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.reload).not.toHaveBeenCalled()

    respond(false)
    await act(async () => { await queryClient.refetchQueries() })

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(document.cookie).not.toContain('orbit_design=')
  })

  it('bounds reloads across refreshes, flag toggles and provider remounts in one page load', async () => {
    respond(false)
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const { useAuthStore, queryClient, unmount, Providers } = await mount()
    signIn(useAuthStore)
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    respond(true)
    await act(async () => { await queryClient.refetchQueries() })
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    respond(false)
    await act(async () => { await queryClient.refetchQueries() })
    unmount()
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    render(<StrictMode><Providers><div>Remounted</div></Providers></StrictMode>)
    await act(async () => { await queryClient.refetchQueries() })
    expect(document.cookie).not.toContain('orbit_design=')
    expect(mocks.reload).toHaveBeenCalledOnce()
  })

  it('rechecks a stale cookie on refresh even when the disabled flag has not changed', async () => {
    respond(false)
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.reload).not.toHaveBeenCalled()

    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    await act(async () => { await queryClient.refetchQueries() })

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(document.cookie).not.toContain('orbit_design=')
  })

  it.each(['pending', 'offline'])('leaves the cookie untouched while account flags are %s', async (state) => {
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    if (state === 'pending') mocks.fetch.mockImplementation(() => new Promise<Response>(() => {}))
    else mocks.fetch.mockRejectedValue(new Error('offline'))
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    const { useAuthStore } = await mount()
    signIn(useAuthStore)
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(cookieWrites).not.toHaveBeenCalled()
    expect(document.cookie).toContain('orbit_design=redesign')
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it.each(['success', 'network failure'])('clears the cookie on sign-out after a BFF %s', async (outcome) => {
    respond(true)
    vi.stubGlobal('fetch', outcome === 'success'
      ? vi.fn(async () => new Response(null, { status: 204 }))
      : vi.fn(async () => { throw new TypeError('offline') }))
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(document.cookie).toContain('orbit_design=redesign')

    await act(async () => { await useAuthStore.getState().logout() })

    expect(document.cookie).not.toContain('orbit_design=')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mocks.reload).not.toHaveBeenCalled()
    expect(globalThis.location.href).toBe('/login')
  })
})
