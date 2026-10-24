import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  clearAllTokens,
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from '@/lib/secure-store'

const { getItemAsyncMock, setItemAsyncMock, deleteItemAsyncMock } = vi.hoisted(() => ({
  getItemAsyncMock: vi.fn(),
  setItemAsyncMock: vi.fn(),
  deleteItemAsyncMock: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>()
  return { default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => { storage.set(key, value); return Promise.resolve() },
    clear: () => { storage.clear(); return Promise.resolve() },
  } }
})

vi.mock('expo-secure-store', () => ({
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
  deleteItemAsync: deleteItemAsyncMock,
}))

describe('mobile secure store helpers', () => {
  beforeEach(() => {
    Platform.OS = 'android'
    getItemAsyncMock.mockReset()
    setItemAsyncMock.mockReset()
    deleteItemAsyncMock.mockReset()
  })

  it('deletes surviving iOS credentials before reading on a fresh install', async () => {
    Platform.OS = 'ios'
    await AsyncStorage.clear()
    vi.resetModules()
    const store = await import('@/lib/secure-store')
    getItemAsyncMock.mockImplementation(() => Promise.resolve(deleteItemAsyncMock.mock.calls.length === 4 ? null : 'old-token'))
    await expect(store.getToken()).resolves.toBeNull()
    expect(deleteItemAsyncMock.mock.calls.map(([key]: [string]) => key).sort((left, right) => left.localeCompare(right))).toEqual([
      'account_config', 'auth_token', 'google_auth_attempt', 'refresh_token',
    ])
    await store.setToken('new-token')
    await store.getRefreshToken()
    expect(deleteItemAsyncMock).toHaveBeenCalledTimes(4)
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

  it('keeps credentials on later iOS launches', async () => {
    Platform.OS = 'ios'
    await AsyncStorage.setItem('orbit:ios-install', '1')
    vi.resetModules()
    const store = await import('@/lib/secure-store')
    getItemAsyncMock.mockResolvedValue('current-token')
    await expect(store.getToken()).resolves.toBe('current-token')
    expect(deleteItemAsyncMock).not.toHaveBeenCalled()
  })

  it('waits for a single reset before concurrent iOS reads and writes', async () => {
    Platform.OS = 'ios'
    await AsyncStorage.clear()
    vi.resetModules()
    const store = await import('@/lib/secure-store')
    let finishDeletion!: () => void
    const deletion = new Promise<void>((resolve) => { finishDeletion = resolve })
    deleteItemAsyncMock.mockReturnValue(deletion)
    const operations = Promise.all([store.getToken(), store.setRefreshToken('new-refresh')])
    await vi.waitFor(() => expect(deleteItemAsyncMock).toHaveBeenCalledTimes(4))
    expect(setItemAsyncMock).not.toHaveBeenCalled()
    expect(getItemAsyncMock).not.toHaveBeenCalled()
    finishDeletion()
    await operations
    expect(setItemAsyncMock).toHaveBeenCalledWith('refresh_token', 'new-refresh')
    expect(await AsyncStorage.getItem('orbit:ios-install')).toBe('1')
  })

  it('retries an incomplete iOS reset without exposing an old token', async () => {
    Platform.OS = 'ios'
    await AsyncStorage.clear()
    vi.resetModules()
    const store = await import('@/lib/secure-store')
    deleteItemAsyncMock.mockRejectedValueOnce(new Error('keychain locked'))
    await expect(store.getToken()).rejects.toThrow('keychain locked')
    expect(getItemAsyncMock).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem('orbit:ios-install')).toBeNull()
    getItemAsyncMock.mockResolvedValue(null)
    await expect(store.getToken()).resolves.toBeNull()
    expect(await AsyncStorage.getItem('orbit:ios-install')).toBe('1')
  })
})
