import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/google/route'
import { setSessionCookies } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  setSessionCookies: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { accessToken: 'supabase-access', language: 'en' }

describe('google BFF route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(setSessionCookies).mockReset()
  })

  it('sets session cookies and strips tokens from the returned user', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'jwt-token',
          refreshToken: 'refresh-token',
          userId: 'user-1',
          name: 'Thomas',
          email: 'thomas@example.com',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(vi.mocked(setSessionCookies)).toHaveBeenCalledWith('jwt-token', 'refresh-token')
    expect(json).not.toHaveProperty('token')
    expect(json).not.toHaveProperty('refreshToken')
  })

  it('rejects a body missing accessToken with 400 before forwarding', async () => {
    const response = await POST(makeRequest({ language: 'en' }))

    expect(response.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the upstream throws', async () => {
    mockFetch.mockRejectedValue(new Error('upstream offline'))

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Authentication failed')
    expect(JSON.stringify(json)).not.toContain('upstream offline')
  })
})
