import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/chat/stream/route'
import { resolveServerSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn(),
  getAccountIdFromToken: vi.fn((token: string) => token === 'other-token' ? 'account-b' : 'account-a'),
}))

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
        token: 'stale-token',
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
      headers: { 'X-Orbit-Held-Account-Id': 'account-a' },
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

  it('refuses a stream when the cookie belongs to another account', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'other-token', expiresAt: Date.now() + 3600000,
      refreshed: false, refreshFailed: false,
    })
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST',
      headers: { 'X-Orbit-Held-Account-Id': 'account-a' },
      body: new FormData(),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ errorCode: 'ACCOUNT_CHANGED' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('forwards a stream when no held account was known', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'other-token', expiresAt: Date.now() + 3600000,
      refreshed: false, refreshFailed: false,
    })
    mockFetch.mockResolvedValue(new Response('data: done\n\n', {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }))
    const request = new NextRequest('http://localhost:3000/api/chat/stream', {
      method: 'POST', body: new FormData(),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
