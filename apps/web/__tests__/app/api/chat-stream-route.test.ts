import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/chat/stream/route'
import { resolveServerSession } from '@/lib/auth-api'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-api')>()),
  resolveServerSession: vi.fn(),
}))

const ACCOUNT_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'
function tokenFor(accountId: string): string {
  return `e30.${Buffer.from(JSON.stringify({ [ACCOUNT_CLAIM]: accountId })).toString('base64url')}.signature`
}

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('chat stream route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(resolveServerSession).mockReset()
  })

  it('reports a confirmed refresh rejection on the response', async () => {
    vi.mocked(resolveServerSession)
      .mockResolvedValueOnce({
        token: tokenFor('account-a'),
        expiresAt: Date.now() + 3600000,
        refreshed: false,
        refreshFailed: false,
      })
      .mockResolvedValueOnce({
        token: null,
        expiresAt: null,
        refreshed: false,
        refreshFailed: true,
      })
    mockFetch.mockResolvedValue(
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const formData = new FormData()
    formData.set('message', 'hello')
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST',
      headers: { 'x-orbit-held-account-id': 'account-a' },
      body: formData,
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('x-orbit-session-refresh')).toBe('failed')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reports a proactive refresh rejection before calling the upstream API', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
      refreshFailed: true,
    })
    const formData = new FormData()
    formData.set('message', 'hello')
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('x-orbit-session-refresh')).toBe('failed')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses a stream whose cookie belongs to another account before forwarding', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({ token: tokenFor('account-b'), expiresAt: null, refreshed: false, refreshFailed: false })
    mockFetch.mockResolvedValue(Response.json({ ok: true }))
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST', headers: { 'x-orbit-held-account-id': 'account-a' }, body: new FormData(),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses a stream with no held account header', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({ token: tokenFor('account-a'), expiresAt: null, refreshed: false, refreshFailed: false })
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST', body: new FormData(),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ errorCode: 'ACCOUNT_CHANGED' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses a stream when refresh switches accounts before retry', async () => {
    vi.mocked(resolveServerSession)
      .mockResolvedValueOnce({ token: tokenFor('account-a'), expiresAt: null, refreshed: false, refreshFailed: false })
      .mockResolvedValueOnce({ token: tokenFor('account-b'), expiresAt: null, refreshed: true, refreshFailed: false })
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST', headers: { 'x-orbit-held-account-id': 'account-a' }, body: new FormData(),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
