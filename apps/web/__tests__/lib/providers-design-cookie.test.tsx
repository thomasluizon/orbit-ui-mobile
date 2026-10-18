import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMockConfigResponse } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), reload: vi.fn() }))
vi.mock('@/lib/api-fetch', () => ({ sessionAwareFetch: mocks.fetch }))
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
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
})

describe('design routing through Providers and the account config query', () => {
  it('sets a host-only secure cookie with a long expiry after sign-in before reloading once', async () => {
    respond(true)
    const cookieWrites = vi.spyOn(document, 'cookie', 'set')
    mocks.reload.mockImplementation(() => expect(document.cookie).toContain('orbit_design=redesign'))
    const { useAuthStore } = await mount()
    expect(mocks.fetch).not.toHaveBeenCalled()

    signIn(useAuthStore)

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(cookieWrites).toHaveBeenCalledWith('orbit_design=redesign; Max-Age=31536000; Path=/; Secure; SameSite=Lax')
  })

  it('keeps the current design when the flag is off', async () => {
    respond(false)
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
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
    expect(cookieWrites).not.toHaveBeenCalled()
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it('switches designs when a flag refresh enables redesign', async () => {
    respond(false)
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.reload).not.toHaveBeenCalled()

    respond(true)
    await act(async () => { await queryClient.refetchQueries() })

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(document.cookie).toContain('orbit_design=redesign')
  })

  it('bounds reloads across refreshes, flag toggles and provider remounts in one page load', async () => {
    respond(true)
    const { useAuthStore, queryClient, unmount, Providers } = await mount()
    signIn(useAuthStore)
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    respond(false)
    await act(async () => { await queryClient.refetchQueries() })
    document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
    respond(true)
    await act(async () => { await queryClient.refetchQueries() })
    unmount()
    render(<StrictMode><Providers><div>Remounted</div></Providers></StrictMode>)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.reload).toHaveBeenCalledOnce()
  })

  it('rechecks a missing cookie on a refresh even when the enabled flag has not changed', async () => {
    respond(true)
    document.cookie = 'orbit_design=redesign; Path=/; Secure; SameSite=Lax'
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(mocks.reload).not.toHaveBeenCalled()

    document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
    await act(async () => { await queryClient.refetchQueries() })

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce())
    expect(document.cookie).toContain('orbit_design=redesign')
  })

  it('does not enable redesign without a resolved account flag', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const { useAuthStore, queryClient } = await mount()
    signIn(useAuthStore)
    await act(async () => { await queryClient.refetchQueries() })
    expect(document.cookie).not.toContain('orbit_design=')
    expect(mocks.reload).not.toHaveBeenCalled()
  })
})
