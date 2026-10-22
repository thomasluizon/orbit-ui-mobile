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
import { setAccountEventOrigin } from '@/lib/account-event-origin'
import { installWebLocks } from '@/__tests__/helpers/web-locks'

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
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')

describe('client response throttle adapter', () => {
  beforeEach(async () => {
    installWebLocks()
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await useOnboardingDraftStore.persist.rehydrate()
    useThrottleStore.getState().clear()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setAccountEventOrigin(null)
  })
  afterEach(() => {
    setAccountEventOrigin(null)
    vi.unstubAllGlobals()
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
    else Reflect.deleteProperty(navigator, 'locks')
  })

  it('records an auth upgrade refusal without consuming or replaying the response', async () => {
    const refused = new Response('Upgrade required', { status: 426 })
    const fetchMock = vi.fn<typeof fetch>(async () => refused)
    vi.stubGlobal('fetch', fetchMock)
    const response = await fetchWithThrottle('/api/auth/send-code')
    expect(response).toBe(refused)
    expect(await response.text()).toBe('Upgrade required')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useVersionGateStore.getState().upgradeRequired).toBe(true)
  })

  it.each(['/api/auth/send-code', '/api/auth/verify-code'])('keeps upgrade guidance and Refresh in the owning auth layout after %s fails', async (endpoint) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 426 })))
    render(createElement(AuthLayout, null, createElement('button', {
      type: 'button', onClick: () => {
        void fetchAuthEndpoint(endpoint, { email: 'person@example.test' }).catch(() => {})
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
    const fetchMock = vi.fn<typeof fetch>(async () => refused)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const init = { method: 'POST', body: new FormData(), signal: controller.signal }
    const response = await fetchWithThrottle('/api/example', init)
    expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({
      retryAt: Date.parse(payload.retryAfterUtc), requestId: payload.requestId,
    })
    expect(response).toBe(refused)
    expect(await response.json()).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/example', { ...init, headers: expect.any(Headers) })
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Accept-Language')).toBe('en')
  })

  it.each(['/api/auth/send-code', '/api/auth/verify-code'])('publishes %s refusals while preserving the login error contract', async (endpoint) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload, { status: 429 })))
    await expect(fetchAuthEndpoint(endpoint, { email: 'user@example.test' })).rejects.toMatchObject({
      status: 429, body: payload,
    })
    expect(getErrorSurface(useThrottleStore.getState().error).retryAt).toBe(Date.parse(payload.retryAfterUtc))
  })

  it('preserves verification language, version, event origin, cancellation and refusal request id', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ error: 'Invalid verification code' }, {
      status: 401, headers: { 'x-orbit-request-id': 'verification-reference' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    setAccountEventOrigin('synthetic-origin')
    const controller = new AbortController()
    const onSuccess = vi.fn(async () => {})
    await expect(fetchAuthEndpoint('/api/auth/verify-code', { language: 'pt-BR' }, {
      signal: controller.signal, isCurrent: () => true, onSuccess,
    })).rejects.toMatchObject({ status: 401, body: { error: 'Invalid verification code', requestId: 'verification-reference' } })
    expect(fetchMock).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(request?.headers)
    expect(headers.get('Accept-Language')).toBe('pt-BR')
    expect(headers.get('api-version')).toBe('2.0')
    expect(headers.get('X-Orbit-Event-Origin')).toBe('synthetic-origin')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(request?.signal).toBe(controller.signal)
    expect(request?.method).toBe('POST')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('retains the upstream-starting verification refusal without replaying the exchange', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ error: 'Upstream service is starting', errorCode: 'UPSTREAM_STARTING' }, {
      status: 503, headers: { 'Retry-After': '5' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchAuthEndpoint('/api/auth/verify-code', {})).rejects.toMatchObject({ status: 503, retryAfter: '5' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useThrottleStore.getState().error).toBeNull()
  })

  it.each([
    [429, '{'],
    [429, JSON.stringify({ error: 'Rate limited' })],
    [429, JSON.stringify({ retryAfterUtc: 'not-a-date' })],
    [500, JSON.stringify(payload)],
    [200, JSON.stringify({ text: 'log water' })],
  ])('preserves status %s and its body without inventing a timed throttle', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
    const response = await fetchWithThrottle('/api/example', { method: 'POST' })
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

  it('throws a read 429 with Retry-After without publishing a throttle deadline', async () => {
    useThrottleStore.getState().clear()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload, { status: 429, headers: { 'Retry-After': '60' } })))
    await expect(fetchWithThrottle('/api/example')).rejects.toMatchObject({ status: 429, retryAfter: '60' })
    expect(useThrottleStore.getState().error).toBeNull()
  })
})
