import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import { useThrottleStore } from '@/stores/throttle-store'
import { getErrorSurface } from '@orbit/shared/utils'

const payload = {
  error: 'Rate limited', requestId: 'request-reference', limit: 1, count: 2,
  retryAfterUtc: '2026-09-06T12:00:00Z',
}

describe('client response throttle adapter', () => {
  beforeEach(() => { useThrottleStore.getState().clear() })
  afterEach(() => { vi.unstubAllGlobals() })

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
