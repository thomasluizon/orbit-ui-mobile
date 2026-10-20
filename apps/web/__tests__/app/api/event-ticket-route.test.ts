import { expect, it, vi } from 'vitest'
import { POST } from '@/app/api/events/ticket/route'
import { API } from '@orbit/shared/api'
import { createApiClientError } from '@orbit/shared'

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

it.each([429, 503])('passes upstream %s and Retry-After through the ticket route', async (status) => {
  serverAuthMutate.mockRejectedValue(Object.assign(
    createApiClientError(status, null, 'Unavailable'), { retryAfter: '60' },
  ))
  const response = await POST()
  expect(response.status).toBe(status)
  expect(response.headers.get('retry-after')).toBe('60')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
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
