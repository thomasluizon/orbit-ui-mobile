import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/verify-code/route'
import { setSessionCookies } from '@/lib/auth-api'

vi.mock('@/lib/auth-api', () => ({
  setSessionCookies: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/verify-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { email: 'thomas@example.com', code: '123456', language: 'en' }

describe('verify-code BFF route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.mocked(setSessionCookies).mockReset()
  })

  it('sets httpOnly session cookies and returns the user without the token', async () => {
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
    expect(json).toMatchObject({ userId: 'user-1', name: 'Thomas', email: 'thomas@example.com' })
    expect(json).not.toHaveProperty('token')
    expect(json).not.toHaveProperty('refreshToken')
  })

  it('rejects a malformed body with 400 before forwarding', async () => {
    const response = await POST(makeRequest({ email: 'thomas@example.com' }))

    expect(response.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(vi.mocked(setSessionCookies)).not.toHaveBeenCalled()
  })

  it('passes through a backend error status and payload', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid verification code', errorCode: 'INVALID_VERIFICATION_CODE' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid verification code')
    expect(json.errorCode).toBe('INVALID_VERIFICATION_CODE')
    expect(vi.mocked(setSessionCookies)).not.toHaveBeenCalled()
  })

  it('returns a generic 500 and does not leak detail when the upstream throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED api-base'))

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Authentication failed')
    expect(JSON.stringify(json)).not.toContain('ECONNREFUSED')
  })
})
