import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/send-code/route'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/send-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { email: 'thomas@example.com', language: 'en' }

describe('send-code BFF route', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('forwards a valid body to the backend and returns its payload', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await POST(makeRequest(validBody))

    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/auth/send-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
    )
  })

  it('rejects a malformed body with 400 before forwarding', async () => {
    const response = await POST(makeRequest({ email: 123 }))

    expect(response.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('passes through a backend rate-limit error', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Please wait', errorCode: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.errorCode).toBe('RATE_LIMITED')
  })

  it('logs server-side and returns a generic 500 when the upstream throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch.mockRejectedValue(new Error('dns failure detail'))

    const response = await POST(makeRequest(validBody))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Authentication failed')
    expect(JSON.stringify(json)).not.toContain('dns failure detail')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
