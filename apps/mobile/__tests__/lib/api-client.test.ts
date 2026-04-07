import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getTokenMock, clearAllTokensMock, fetchMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  clearAllTokensMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: getTokenMock,
  clearAllTokens: clearAllTokensMock,
}))

vi.stubGlobal('fetch', fetchMock)

import { apiClient } from '@/lib/api-client'

describe('mobile apiClient', () => {
  beforeEach(() => {
    getTokenMock.mockReset()
    clearAllTokensMock.mockReset()
    fetchMock.mockReset()
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
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
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
        headers: {},
      }),
    )
  })

  it('clears tokens and throws on unauthorized responses', async () => {
    getTokenMock.mockResolvedValue('token-123')
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
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

  it('returns undefined for 204 responses', async () => {
    getTokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    })

    await expect(apiClient('/empty')).resolves.toBeUndefined()
  })

  it('returns undefined for successful empty 200 responses', async () => {
    getTokenMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    })

    await expect(apiClient('/empty-200')).resolves.toBeUndefined()
  })
})
