import { createElement } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AuthLayout from '@/app/(auth)/layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useThrottleStore } from '@/stores/throttle-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getErrorSurface } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(globalThis.location.search),
}))

const payload = {
  error: 'Rate limited', requestId: 'request-reference', limit: 1, count: 2,
  retryAfterUtc: '2026-09-06T12:00:00Z',
}

describe('client response throttle adapter', () => {
  beforeEach(async () => {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await useOnboardingDraftStore.persist.rehydrate()
    useThrottleStore.getState().clear()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('records an auth upgrade refusal without consuming or replaying the response', async () => {
    const refused = new Response('Upgrade required', { status: 426 })
    const fetchMock = vi.fn(async () => refused)
    vi.stubGlobal('fetch', fetchMock)
    const response = await fetchWithThrottle('/api/auth/send-code')
    expect(response).toBe(refused)
    expect(await response.text()).toBe('Upgrade required')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useVersionGateStore.getState().upgradeRequired).toBe(true)
  })

  it('keeps upgrade guidance and Refresh in the owning auth layout after Send code fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 426 })))
    render(createElement(AuthLayout, null, createElement('button', {
      type: 'button', onClick: () => {
        void fetchAuthEndpoint('/api/auth/send-code', { email: 'person@example.test' }).catch(() => {})
      },
    }, 'Send code')))
    await act(async () => {})
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })) })
    expect(region).toHaveTextContent('forceUpdate.banner')
    expect(screen.getByRole('button', { name: 'forceUpdate.refresh' })).toBeEnabled()
  })

  it('publishes a deadline without consuming the caller response or replaying the request', async () => {
    const refused = Response.json(payload, { status: 429 })
    const fetchMock = vi.fn(async () => refused)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const init = { method: 'POST', body: new FormData(), signal: controller.signal }
    const response = await fetchWithThrottle('/api/example', init)
    expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({
      retryAt: Date.parse(payload.retryAfterUtc), requestId: payload.requestId,
    })
    expect(response).toBe(refused)
    expect(await response.json()).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/example', init)
  })

  it('publishes auth refusals while preserving the login error contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload, { status: 429 })))
    await expect(fetchAuthEndpoint('/api/auth/send-code', { email: 'user@example.test' })).rejects.toMatchObject({
      status: 429, body: payload,
    })
    expect(getErrorSurface(useThrottleStore.getState().error).retryAt).toBe(Date.parse(payload.retryAfterUtc))
  })

  it.each([
    [429, '{'],
    [429, JSON.stringify({ error: 'Rate limited' })],
    [429, JSON.stringify({ retryAfterUtc: 'not-a-date' })],
    [500, JSON.stringify(payload)],
    [200, JSON.stringify({ text: 'log water' })],
  ])('preserves status %s and its body without inventing a timed throttle', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
    const response = await fetchWithThrottle('/api/example')
    expect(response.status).toBe(status)
    expect(await response.text()).toBe(body)
    expect(useThrottleStore.getState().error).toBeNull()
  })

  it('propagates transport rejection to its caller', async () => {
    const failure = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn(async () => { throw failure }))
    await expect(fetchWithThrottle('/api/example')).rejects.toBe(failure)
    expect(useThrottleStore.getState().error).toBeNull()
  })
})
