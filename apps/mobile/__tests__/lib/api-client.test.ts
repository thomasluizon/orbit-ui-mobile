import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/lib/api-client'

const {
  getTokenMock,
  clearAllTokensMock,
  fetchMock,
  refreshSessionMock,
  clearSessionAndResetAuthMock,
  isAuthTransitionInFlightMock,
  buildAppVersionHeadersMock,
  markUpgradeRequiredMock,
  routerReplaceMock,
} = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  clearAllTokensMock: vi.fn(),
  fetchMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  clearSessionAndResetAuthMock: vi.fn(),
  isAuthTransitionInFlightMock: vi.fn(() => false),
  buildAppVersionHeadersMock: vi.fn(() => ({ 'X-App-Version': '1.1.4' })),
  markUpgradeRequiredMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: getTokenMock,
  clearAllTokens: clearAllTokensMock,
}))

vi.mock('@/lib/app-version', () => ({
  buildAppVersionHeaders: buildAppVersionHeadersMock,
}))

vi.mock('@/stores/version-gate-store', () => ({
  markUpgradeRequired: markUpgradeRequiredMock,
}))

vi.mock('@/stores/auth-store', () => ({
  refreshSession: refreshSessionMock,
  clearSessionAndResetAuth: clearSessionAndResetAuthMock,
  isAuthTransitionInFlight: isAuthTransitionInFlightMock,
}))

vi.mock('expo-router', () => ({
  router: { replace: routerReplaceMock },
}))

vi.stubGlobal('fetch', fetchMock)

describe('mobile apiClient', () => {
  beforeEach(() => {
    getTokenMock.mockReset()
    clearAllTokensMock.mockReset()
    fetchMock.mockReset()
    refreshSessionMock.mockReset()
    clearSessionAndResetAuthMock.mockReset()
    isAuthTransitionInFlightMock.mockReset()
    isAuthTransitionInFlightMock.mockReturnValue(false)
    markUpgradeRequiredMock.mockReset()
    routerReplaceMock.mockReset()
    buildAppVersionHeadersMock.mockReset()
    buildAppVersionHeadersMock.mockReturnValue({ 'X-App-Version': '1.1.4' })
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
          'X-App-Version': '1.1.4',
        }),
      }),
    )
  })

  it('flags upgrade required and throws on a 426 without retrying', async () => {
    getTokenMock.mockResolvedValue('token-123')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 426,
      json: () =>
        Promise.resolve({
          error: 'Upgrade required',
          errorCode: 'UPGRADE_REQUIRED',
          upgradeRequired: true,
          minVersion: '1.5.0',
        }),
    })

    await expect(apiClient('/secure')).rejects.toThrow('Upgrade required')

    expect(markUpgradeRequiredMock).toHaveBeenCalledWith('1.5.0')
    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
    refreshSessionMock.mockResolvedValue({ status: 'refreshed', token: 'token-456' })
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      })

    await expect(apiClient('/secure')).resolves.toEqual({ ok: true })

    expect(refreshSessionMock).toHaveBeenCalledWith({ clearOnFailure: false })
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

  it('retries with the newest stored token after a mid-flight rotation instead of clearing the session', async () => {
    getTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValue('fresh-token')
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ ok: true })),
      })

    await expect(apiClient('/secure')).resolves.toEqual({ ok: true })

    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(clearSessionAndResetAuthMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.useorbit.org/secure',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
        }),
      }),
    )
  })

  it('clears auth state when refresh cannot recover a 401', async () => {
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionMock.mockResolvedValue({ status: 'unauthorized' })
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')

    expect(clearSessionAndResetAuthMock).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock).toHaveBeenCalledWith('/login')
  })

  it('clears the session and redirects when the retried request still 401s after a refresh', async () => {
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionMock.mockResolvedValue({ status: 'refreshed', token: 'token-456' })
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')

    expect(clearSessionAndResetAuthMock).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock).toHaveBeenCalledWith('/login')
  })

  it('does not clear the session on a 401 caused by a transient refresh network blip', async () => {
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionMock.mockResolvedValue({ status: 'network-error' })
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')

    expect(clearSessionAndResetAuthMock).not.toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('does not clear the session on a 401 while an auth transition is in flight', async () => {
    isAuthTransitionInFlightMock.mockReturnValue(true)
    getTokenMock.mockResolvedValue('token-123')
    refreshSessionMock.mockResolvedValue({ status: 'unauthorized' })
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(apiClient('/secure')).rejects.toThrow('Unauthorized')

    expect(clearSessionAndResetAuthMock).not.toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()
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
