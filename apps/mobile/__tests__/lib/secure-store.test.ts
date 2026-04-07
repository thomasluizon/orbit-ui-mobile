import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getItemAsyncMock, setItemAsyncMock, deleteItemAsyncMock } = vi.hoisted(() => ({
  getItemAsyncMock: vi.fn(),
  setItemAsyncMock: vi.fn(),
  deleteItemAsyncMock: vi.fn(),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
  deleteItemAsync: deleteItemAsyncMock,
}))

import {
  clearAllTokens,
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from '@/lib/secure-store'

describe('mobile secure store helpers', () => {
  beforeEach(() => {
    getItemAsyncMock.mockReset()
    setItemAsyncMock.mockReset()
    deleteItemAsyncMock.mockReset()
  })

  it('reads and writes auth tokens', async () => {
    getItemAsyncMock.mockResolvedValueOnce('auth').mockResolvedValueOnce('refresh')

    await setToken('auth')
    await setRefreshToken('refresh')

    await expect(getToken()).resolves.toBe('auth')
    await expect(getRefreshToken()).resolves.toBe('refresh')

    expect(setItemAsyncMock).toHaveBeenNthCalledWith(1, 'auth_token', 'auth')
    expect(setItemAsyncMock).toHaveBeenNthCalledWith(2, 'refresh_token', 'refresh')
  })

  it('clears both tokens', async () => {
    await clearToken()
    await clearRefreshToken()
    await clearAllTokens()

    expect(deleteItemAsyncMock).toHaveBeenCalledWith('auth_token')
    expect(deleteItemAsyncMock).toHaveBeenCalledWith('refresh_token')
  })
})
