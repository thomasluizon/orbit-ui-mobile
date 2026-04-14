import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/subscriptions/checkout/route'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  getAuthToken: vi.fn(),
  tryRefreshSession: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('subscriptions checkout route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(getAuthToken).mockReset()
    vi.mocked(tryRefreshSession).mockReset()
  })

  it('forwards geo country headers and a sanitized client ip', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('token')
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
})
