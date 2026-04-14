import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/[...path]/route'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  getAuthToken: vi.fn(),
  tryRefreshSession: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createRequest(
  path: string,
  options: { headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/${path}`, {
    headers: options.headers,
  })
}

describe('catch-all API proxy route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(getAuthToken).mockReset()
    vi.mocked(tryRefreshSession).mockReset()
  })

  it('rejects malformed paths before calling auth or backend', async () => {
    const request = createRequest('auth//session')

    const response = await GET(request, {
      params: Promise.resolve({ path: ['auth', '', 'session'] }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(getAuthToken).not.toHaveBeenCalled()
    expect(tryRefreshSession).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('forwards only a sanitized client ip and retries with a refreshed token', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('initial-token')
    vi.mocked(tryRefreshSession).mockResolvedValue('refreshed-token')
    mockFetch
      .mockResolvedValueOnce(
        new Response('unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"ok":true}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-total-count': '1',
          },
        }),
      )

    const request = createRequest('profile/me?include=details', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-real-ip': '198.51.100.7',
      },
    })

    const response = await GET(request, {
      params: Promise.resolve({ path: ['profile', 'me'] }),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"ok":true}')
    expect(tryRefreshSession).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const firstCall = mockFetch.mock.calls[0]
    expect(firstCall?.[0]).toBe('http://localhost:5000/api/profile/me?include=details')
    expect(firstCall?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        Authorization: 'Bearer initial-token',
        'X-Forwarded-For': '203.0.113.10',
      },
    })

    const secondCall = mockFetch.mock.calls[1]
    expect(secondCall?.[0]).toBe('http://localhost:5000/api/profile/me?include=details')
    expect(secondCall?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        Authorization: 'Bearer refreshed-token',
        'X-Forwarded-For': '203.0.113.10',
      },
    })
  })

  it('allows AI metadata routes through the proxy allowlist', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('initial-token')
    mockFetch.mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = createRequest('ai/capabilities')

    const response = await GET(request, {
      params: Promise.resolve({ path: ['ai', 'capabilities'] }),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('[]')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:5000/api/ai/capabilities')
  })
})
