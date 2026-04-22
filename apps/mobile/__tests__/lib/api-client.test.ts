import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getTokenMock,
  clearAllTokensMock,
  fetchMock,
  refreshSessionTokenMock,
  clearSessionAndResetAuthMock,
} = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  clearAllTokensMock: vi.fn(),
  fetchMock: vi.fn(),
  refreshSessionTokenMock: vi.fn(),
  clearSessionAndResetAuthMock: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: getTokenMock,
  clearAllTokens: clearAllTokensMock,
}))

vi.mock('@/stores/auth-store', () => ({
  refreshSessionToken: refreshSessionTokenMock,
  clearSessionAndResetAuth: clearSessionAndResetAuthMock,
}))

vi.stubGlobal('fetch', fetchMock)

import { apiClient } from '@/lib/api-client'

describe('mobile apiClient', () => {
  beforeEach(() => {
    getTokenMock.mockReset()
    clearAllTokensMock.mockReset()
    fetchMock.mockReset()
    refreshSessionTokenMock.mockReset()
    clearSessionAndResetAuthMock.mockReset()
  })

  it('adds auth and JSON headers for standard requests', async () => {
    getTokenMock.mockResolvedValue('token-123')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    })

    await expect(apiClient('/api/test', { method: 'POST', body: '{"a":1}' })).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.useorbit.org/api/test',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
          'X-Orbit-Time-Zone': expect.any(String),
        }),
      }),
    )
  })

  it('does not force JSON headers for FormData bodies', async () => {
    getTokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ uploaded: true })),
    })

    const body = new FormData()
    body.append('file', 'content')

    await apiClient('/upload', { method: 'POST', body })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.useorbit.org/upload',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Orbit-Time-Zone': expect.any(String),
        }),
      }),
    )
  })

  it('retries once after a 401 when refresh succeeds', async () => {
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionTokenMock.mockResolvedValue('token-456')
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      })

    await expect(apiClient('/secure')).resolves.toEqual({ ok: true })

    expect(refreshSessionTokenMock).toHaveBeenCalledWith({ clearOnFailure: false })
    expect(clearSessionAndResetAuthMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.useorbit.org/secure',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-456',
        }),
      }),
    )
  })

  it('clears auth state when refresh cannot recover a 401', async () => {
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionTokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')

    expect(clearSessionAndResetAuthMock).toHaveBeenCalledTimes(1)
  })

  it('prefers backend error payload text when available', async () => {
    getTokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Validation failed' }),
    })

    await expect(apiClient('/broken')).rejects.toThrow('Validation failed')
  })
})
