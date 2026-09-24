import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/subscriptions/plans/route'
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

describe('subscriptions plans route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(resolveServerSession).mockReset()
  })

  it('forwards geo country headers and a sanitized client ip', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      token: 'token',
      expiresAt: Date.now() + 3600000,
      refreshed: false,
      refreshFailed: false,
    })
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

    const response = await GET(
      new NextRequest('http://localhost:3000/api/subscriptions/plans'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-orbit-session-refresh')).toBe('failed')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('preserves a proactive refresh rejection through the unauthorized proxy response', async () => {
    vi.mocked(resolveServerSession)
      .mockResolvedValueOnce({
        token: null,
        expiresAt: null,
        refreshed: false,
        refreshFailed: true,
      })
      .mockResolvedValueOnce({
        token: null,
        expiresAt: null,
        refreshed: false,
        refreshFailed: false,
      })
    mockFetch.mockResolvedValue(
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await GET(
      new NextRequest('http://localhost:3000/api/subscriptions/plans'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-orbit-session-refresh')).toBe('failed')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
