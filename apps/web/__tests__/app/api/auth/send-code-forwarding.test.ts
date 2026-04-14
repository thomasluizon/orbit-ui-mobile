import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/send-code/route'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/send-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ email: 'user@example.com' }),
  })
}

describe('POST /api/auth/send-code — client context forwarding', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('forwards X-Forwarded-For from x-forwarded-for header so backend rate-limits by real client IP', async () => {
    const request = createRequest({ 'x-forwarded-for': '203.0.113.42' })

    await POST(request)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Forwarded-For']).toBe('203.0.113.42')
  })

  it('forwards CF-Connecting-IP when present (Cloudflare)', async () => {
    const request = createRequest({
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '10.0.0.1',
    })

    await POST(request)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['CF-Connecting-IP']).toBe('198.51.100.7')
    expect(headers['X-Forwarded-For']).toBe('198.51.100.7')
  })

  it('forwards X-Orbit-Country-Code when resolvable from CF-IPCountry', async () => {
    const request = createRequest({
      'cf-ipcountry': 'BR',
      'x-forwarded-for': '198.51.100.7',
    })

    await POST(request)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Orbit-Country-Code']).toBe('BR')
  })

  it('does not add X-Forwarded-For when no client IP headers are present', async () => {
    const request = createRequest({})

    await POST(request)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Forwarded-For']).toBeUndefined()
  })
})
