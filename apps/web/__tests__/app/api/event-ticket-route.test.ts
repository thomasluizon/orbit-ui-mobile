import { expect, it, vi } from 'vitest'
import { POST } from '@/app/api/events/ticket/route'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared'
import { consumeAccountEventStream } from '@orbit/shared/query'

const serverAuthMutate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate }))

it('returns a single-purpose ticket without caching the BFF response', async () => {
  serverAuthMutate.mockResolvedValue({ ticket: 'short-lived', expiresAtUtc: '2026-09-26T20:00:00Z' })
  const response = await POST()
  expect(serverAuthMutate).toHaveBeenCalledWith(
    API.events.ticket,
    { method: 'POST', cache: 'no-store' },
    null,
    expect.any(Object),
  )
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ ticket: 'short-lived' })
})

it('reports a definitive session rejection to the event connection', async () => {
  serverAuthMutate.mockRejectedValue(Object.assign(
    createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized'),
    { sessionRefreshFailed: true },
  ))
  const response = await POST()
  expect(response.status).toBe(401)
  expect(response.headers.get('x-orbit-session-refresh')).toBe('failed')
})

it.each([429, 502, 503, 504])('passes upstream %s and Retry-After through the ticket route', async (status) => {
  serverAuthMutate.mockRejectedValue(createApiClientError(status, null, 'Unavailable', '60'))
  const response = await POST()
  expect(response.status).toBe(status)
  expect(response.headers.get('retry-after')).toBe('60')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ error: 'Unavailable' })
})

it.each([502, 504])('preserves an upstream %s body without inventing Retry-After', async (status) => {
  const payload = { error: 'Gateway unavailable' }
  serverAuthMutate.mockRejectedValue(createApiClientError(status, payload, 'Unavailable'))
  const response = await POST()
  expect(response.status).toBe(status)
  expect(response.headers.get('retry-after')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual(payload)
})

it.each([400, 403, 404, 500])('rethrows an unexpected upstream %s', async (status) => {
  const failure = createApiClientError(status, null, 'Unexpected failure')
  serverAuthMutate.mockRejectedValue(failure)
  await expect(POST()).rejects.toBe(failure)
})

it('rethrows failures outside the API error boundary', async () => {
  const failure = new Error('Ticket implementation failed')
  serverAuthMutate.mockRejectedValue(failure)
  await expect(POST()).rejects.toBe(failure)
})

it.each([502, 504])('recovers from ticket route %s responses without reporting a stream error', async (status) => {
  serverAuthMutate.mockRejectedValue(createApiClientError(status, null, 'Unavailable'))
  const response = await POST()
  const controller = new AbortController()
  const open = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(response)
    .mockResolvedValueOnce(new Response('event: ready\ndata: {"connectionId":"recovered"}\n\n'))
  const onError = vi.fn()
  const onOpen = vi.fn()
  const onEvent = vi.fn(() => controller.abort())
  vi.useFakeTimers()
  const running = consumeAccountEventStream({
    open, signal: controller.signal, onError, onOpen, onEvent, onReconnect: vi.fn(),
  })
  try {
    await vi.advanceTimersByTimeAsync(1999)
    expect(open).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3999)
    expect(open).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(3)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({ type: 'ready', connectionId: 'recovered', id: null })
    expect(onError).not.toHaveBeenCalled()
  } finally {
    controller.abort()
    await running
    vi.useRealTimers()
  }
})

it.each([
  { status: 503, errorCode: 'UPSTREAM_STARTING', retryAfter: '5' },
  { status: 429, errorCode: 'RATE_LIMITED', retryAfter: '60' },
])('preserves the $errorCode envelope through the ticket route', async ({ status, errorCode, retryAfter }) => {
  const payload = { error: 'Unavailable', errorCode, requestId: 'request-reference' }
  serverAuthMutate.mockRejectedValue(createApiClientError(status, payload, 'Unavailable', retryAfter))
  const response = await POST()
  expect(response.status).toBe(status)
  expect(response.headers.get('retry-after')).toBe(retryAfter)
  expect(await response.json()).toEqual(payload)
})
