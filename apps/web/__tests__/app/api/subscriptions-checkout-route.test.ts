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

    const request = new NextRequest('http://localhost:3000/api/subscriptions/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.21, 10.0.0.1',
        'x-vercel-ip-country': 'BR',
        'cf-ipcountry': 'BR',
        'cloudfront-viewer-country': 'BR',
      },
      body: JSON.stringify({ priceId: 'price_123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/subscriptions/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ priceId: 'price_123' }),
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.21',
          'X-Vercel-IP-Country': 'BR',
          'CF-IPCountry': 'BR',
          'CloudFront-Viewer-Country': 'BR',
        },
      }),
    )
  })
})
