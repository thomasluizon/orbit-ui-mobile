import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/subscriptions/checkout/route'
import { resolveServerSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('subscriptions checkout route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(resolveServerSession).mockReset()
  })

  it('forwards geo country headers and a sanitized client ip', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue(
      new Response('{"url":"https://example.com"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout?timeZone=America%2FSao_Paulo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '177.10.20.31',
        'x-forwarded-for': '203.0.113.21, 10.0.0.1',
        'x-vercel-ip-country': 'BR',
        'cf-ipcountry': 'BR',
        'cloudfront-viewer-country': 'BR',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/subscriptions/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_123' }),
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
          'X-Orbit-Country-Code': 'BR',
          'CF-Connecting-IP': '177.10.20.31',
          'X-Forwarded-For': '177.10.20.31',
          'X-Vercel-IP-Country': 'BR',
          'CF-IPCountry': 'BR',
          'CloudFront-Viewer-Country': 'BR',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'X-Orbit-Time-Zone': 'America/Sao_Paulo',
        },
      }),
    )
  })

  it('rejects an unauthenticated request with 401 and never calls the upstream API', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: null,
      expiresAt: null,
      refreshed: false,
    })

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(resolveServerSession).toHaveBeenCalledTimes(1)
  })

  it('propagates a backend 400 for an invalid checkout payload without coercing the status', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue(
      new Response('{"error":"priceId is required"}', {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: '' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"error":"priceId is required"}')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('propagates an upstream 5xx failure as an error status, not a 200', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
    })
    mockFetch.mockResolvedValue(
      new Response('{"error":"checkout provider unavailable"}', {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(502)
    expect(await response.text()).toBe('{"error":"checkout provider unavailable"}')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('force-refreshes the session and retries once when the upstream returns 401', async () => {
    vi.mocked(resolveServerSession)
      .mockResolvedValueOnce({
        token: 'stale-token',
        expiresAt: Date.now() + 3600000,
        refreshed: false,
      })
      .mockResolvedValueOnce({
        token: 'fresh-token',
        expiresAt: Date.now() + 3600000,
        refreshed: true,
      })
    mockFetch
      .mockResolvedValueOnce(
        new Response('{"error":"unauthorized"}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"url":"https://checkout.example.com"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"url":"https://checkout.example.com"}')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(resolveServerSession)).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://localhost:5000/api/subscriptions/checkout',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    )
  })

  it('returns the upstream 401 when the refresh yields no token and does not retry', async () => {
    vi.mocked(resolveServerSession)
      .mockResolvedValueOnce({
        token: 'stale-token',
        expiresAt: Date.now() + 3600000,
        refreshed: false,
      })
      .mockResolvedValueOnce({
        token: null,
        expiresAt: null,
        refreshed: false,
      })
    mockFetch.mockResolvedValue(
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('{"error":"unauthorized"}')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(resolveServerSession).toHaveBeenCalledTimes(2)
  })
})
