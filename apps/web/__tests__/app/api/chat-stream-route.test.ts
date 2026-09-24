import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/chat/stream/route'
import { resolveServerSession } from '@/lib/auth-api'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn(),
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
})
