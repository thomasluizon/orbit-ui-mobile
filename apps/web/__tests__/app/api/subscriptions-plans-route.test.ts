import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/subscriptions/plans/route'
import { getAuthToken, tryRefreshSession } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  getAuthToken: vi.fn(),
  tryRefreshSession: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('subscriptions plans route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(getAuthToken).mockReset()
    vi.mocked(tryRefreshSession).mockReset()
  })

  it('forwards geo country headers and a sanitized client ip', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('token')
    mockFetch.mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const request = new NextRequest('http://localhost:3000/api/subscriptions/plans?timeZone=America%2FSao_Paulo', {
      headers: {
        'cf-connecting-ip': '177.10.20.30',
        'x-forwarded-for': '203.0.113.20, 10.0.0.1',
        'x-real-ip': '198.51.100.5',
        'x-vercel-ip-country': 'BR',
        'cf-ipcountry': 'BR',
        'cloudfront-viewer-country': 'BR',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/subscriptions/plans',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer token',
          'X-Orbit-Country-Code': 'BR',
          'CF-Connecting-IP': '177.10.20.30',
          'X-Forwarded-For': '177.10.20.30',
          'X-Real-IP': '198.51.100.5',
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
