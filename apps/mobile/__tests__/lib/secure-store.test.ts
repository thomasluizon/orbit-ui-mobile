import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRandomBytesAsync } from 'expo-crypto'
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

vi.mock('expo-crypto', () => ({ getRandomBytesAsync: vi.fn() }))

const { getItemAsyncMock, setItemAsyncMock, deleteItemAsyncMock, clearWidgetTokenMock } = vi.hoisted(() => ({
  getItemAsyncMock: vi.fn(),
  setItemAsyncMock: vi.fn(),
  deleteItemAsyncMock: vi.fn<(key: string) => Promise<void>>(),
  clearWidgetTokenMock: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/orbit-widget', () => ({ clearWidgetToken: clearWidgetTokenMock }))

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
    getItemAsyncMock.mockImplementation(() => Promise.resolve(deleteItemAsyncMock.mock.calls.length === 5 ? null : 'old-token'))
    await expect(store.getToken()).resolves.toBeNull()
    expect(deleteItemAsyncMock.mock.calls.map(([key]) => key).sort((left, right) => left.localeCompare(right))).toEqual([
      'account_config', 'auth_token', 'google_auth_attempt', 'push_install_secret', 'refresh_token',
    ])
    await store.setToken('new-token')
    await store.getRefreshToken()
    expect(deleteItemAsyncMock).toHaveBeenCalledTimes(5)
  })

  it('clears the shared widget Keychain before marking a new iOS install initialized', async () => {
    Platform.OS = 'ios'
    await AsyncStorage.clear()
    vi.resetModules()
    const store = await import('@/lib/secure-store')
    clearWidgetTokenMock.mockReset().mockRejectedValueOnce(new Error('Keychain unavailable'))
    await expect(store.getToken()).rejects.toThrow('Keychain unavailable')
    expect(await AsyncStorage.getItem('orbit:ios-install')).toBeNull()
    clearWidgetTokenMock.mockResolvedValue(undefined)
    await store.getToken()
    expect(clearWidgetTokenMock).toHaveBeenCalledTimes(2)
    expect(await AsyncStorage.getItem('orbit:ios-install')).toBe('1')
  })

  it('creates one base64url push secret for concurrent callers and reuses it after a restart', async () => {
    vi.resetModules()
    getItemAsyncMock.mockResolvedValue(null)
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => 224 + index)
    vi.mocked(getRandomBytesAsync).mockReset().mockResolvedValue(bytes)
    const store = await import('@/lib/secure-store')
    const [first, concurrent] = await Promise.all([store.getPushSecret(), store.getPushSecret()])
    expect(first).toBe(Buffer.from(bytes).toString('base64url'))
    expect(concurrent).toBe(first)
    expect(getRandomBytesAsync).toHaveBeenCalledExactlyOnceWith(32)
    expect(setItemAsyncMock).toHaveBeenCalledExactlyOnceWith('push_install_secret', first)

    getItemAsyncMock.mockResolvedValue(first)
    vi.resetModules()
    const restarted = await import('@/lib/secure-store')
    expect(await restarted.getPushSecret()).toBe(first)
    expect(getRandomBytesAsync).toHaveBeenCalledOnce()
  })

  it('creates different push secrets for separate installs and retries failed persistence', async () => {
    getItemAsyncMock.mockResolvedValue(null)
    vi.mocked(getRandomBytesAsync).mockReset()
      .mockResolvedValueOnce(new Uint8Array(32).fill(1))
      .mockResolvedValueOnce(new Uint8Array(32).fill(2))
      .mockResolvedValueOnce(new Uint8Array(32).fill(3))
    vi.resetModules()
    const firstInstall = await import('@/lib/secure-store')
    const first = await firstInstall.getPushSecret()
    vi.resetModules()
    const secondInstall = await import('@/lib/secure-store')
    setItemAsyncMock.mockRejectedValueOnce(new Error('Keychain locked'))
    await expect(secondInstall.getPushSecret()).rejects.toThrow('Keychain locked')
    const second = await secondInstall.getPushSecret()
    expect(second).not.toBe(first)
    expect(second).toHaveLength(43)
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
    await vi.waitFor(() => expect(deleteItemAsyncMock).toHaveBeenCalledTimes(5))
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
