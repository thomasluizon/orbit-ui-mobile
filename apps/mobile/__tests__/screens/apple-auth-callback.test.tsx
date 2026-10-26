import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { captureMessage } from '@sentry/react-native'
import AuthCallbackScreen from '@/app/auth-callback'
import { createAuthReturnUrlAttempt, getAuthReturnUrlAttempt, getStoredAuthReturnUrl, storeAuthReturnUrl } from '@/lib/auth-flow'

const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer

const mocks = vi.hoisted(() => ({
  params: { provider: 'apple', handoff: 'handoff', state: 'callback-state-0001' },
  apiClient: vi.fn(), login: vi.fn(), replace: vi.fn(), state: 'pending', epoch: 0,
  continueAccount: null as null | (() => void),
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: vi.fn() }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params, useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@react-native-async-storage/async-storage', () => {
  const entries = new Map<string, string>()
  return { default: {
    getItem: (key: string) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key: string, value: string) => { entries.set(key, value); return Promise.resolve() },
    removeItem: (key: string) => { entries.delete(key); return Promise.resolve() },
  } }
})
vi.mock('@/components/auth/login-content', () => ({
  LoginContent: ({ callback }: { callback: { state: string; onContinue: () => void } }) => {
    mocks.state = callback.state
    mocks.continueAccount = callback.onContinue
    return null
  },
}))
vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: mocks.epoch }),
  useAuthStore: Object.assign((select: (session: { login: typeof mocks.login; isLoading: boolean }) => unknown) => select({ login: mocks.login, isLoading: false }), {
    getState: () => ({ isAuthenticated: false }),
  }),
}))
const login = { token: 'session-token', refreshToken: 'refresh-token', userId: 'account-1', name: 'Person', email: 'person@example.test', wasReactivated: false }
let sequence = 0
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.apiClient.mockReset()
  mocks.login.mockReset()
  mocks.state = 'pending'
  mocks.continueAccount = null
  mocks.params.state = `callback-state-${++sequence}`
  mocks.epoch += 1
  mocks.apiClient.mockResolvedValue(login)
  mocks.login.mockImplementation((_token: string, _refreshToken: string | null, _user: unknown,
    expectedEpoch?: number, isAttemptCurrent?: () => boolean) => {
    if ((expectedEpoch !== undefined && expectedEpoch !== mocks.epoch) || isAttemptCurrent?.() === false) return Promise.resolve(null)
    const committedEpoch = ++mocks.epoch
    return Promise.resolve(() => committedEpoch === mocks.epoch)
  })
  await storeAuthReturnUrl('/', getAuthReturnUrlAttempt())
  await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: mocks.params.state, startedAt: Date.now() }))
})
async function mount() {
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(async () => { tree = TestRenderer.create(<AuthCallbackScreen />); await new Promise((resolve) => setTimeout(resolve, 0)) })
  return tree
}

describe('Apple callback route', () => {
  it.each([
    ['handoff', 'missing_code'], ['state', 'missing_state'],
  ] as const)('reports missing %s once without exchanging credentials', async (field, reason) => {
    const original = mocks.params[field]
    mocks.params[field] = ''
    const tree = await mount()
    expect(mocks.state).toBe('failed')
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'apple', reason },
    })
    expect(mocks.apiClient).not.toHaveBeenCalled()
    act(() => tree.unmount())
    mocks.params[field] = original
  })

  it('reports session hydration failure without sending the rejected error content', async () => {
    mocks.login.mockRejectedValueOnce(new Error('private profile content'))
    const tree = await mount()
    expect(mocks.state).toBe('failed')
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'apple', reason: 'profile_hydration_failed' },
    })
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => tree.unmount())
  })

  it('rejects a state mismatch without exchanging or installing a session', async () => {
    mocks.params.state = 'unowned-state-0000'
    const tree = await mount()
    expect(mocks.state).toBe('failed')
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'apple', reason: 'state_mismatch' },
    })
    act(() => tree.unmount())
  })

  it('navigates and consumes the return URL after login commits a new epoch', async () => {
    const expectedEpoch = mocks.epoch
    const tree = await mount()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.appleHandoff, expect.objectContaining({ body: JSON.stringify({ handoff: 'handoff', state: mocks.params.state }) }), expect.anything())
    expect(mocks.login).toHaveBeenCalledWith('session-token', 'refresh-token', expect.objectContaining({ userId: 'account-1' }), expectedEpoch, expect.any(Function))
    expect(mocks.epoch).toBe(expectedEpoch + 1)
    expect(mocks.replace).toHaveBeenCalledWith('/(tabs)')
    expect(captureMessage).not.toHaveBeenCalled()
    expect(await getStoredAuthReturnUrl(getAuthReturnUrlAttempt())).toBeNull()
    act(() => tree.unmount())
  })

  it('continues a reactivated account after login commits a new epoch', async () => {
    mocks.apiClient.mockResolvedValueOnce({ ...login, wasReactivated: true })
    const expectedEpoch = mocks.epoch
    const tree = await mount()
    expect(mocks.state).toBe('account')
    expect(mocks.login).not.toHaveBeenCalled()
    await act(async () => { mocks.continueAccount?.(); await Promise.resolve() })
    expect(mocks.epoch).toBe(expectedEpoch + 1)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/(tabs)')
    expect(await getStoredAuthReturnUrl(getAuthReturnUrlAttempt())).toBeNull()
    act(() => tree.unmount())
  })

  it('does not continue a reactivated account after another session replaces it', async () => {
    mocks.apiClient.mockResolvedValueOnce({ ...login, wasReactivated: true })
    const tree = await mount()
    expect(mocks.state).toBe('account')
    mocks.epoch += 1
    await act(async () => { mocks.continueAccount?.(); await Promise.resolve() })
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(await getStoredAuthReturnUrl(getAuthReturnUrlAttempt())).toBe('/')
    act(() => tree.unmount())
  })

  it.each(['session', 'callback', 'return URL attempt'])('rejects a replaced %s after the login commits', async (replacement) => {
    const commitLogin = mocks.login.getMockImplementation()!
    let release!: () => void
    mocks.login.mockImplementationOnce(async (...args) => {
      const currentSession = await commitLogin(...args)
      await new Promise<void>((resolve) => { release = resolve })
      return currentSession
    })
    const tree = await mount()
    const committedEpoch = mocks.epoch
    if (replacement === 'session') mocks.epoch += 1
    if (replacement === 'return URL attempt') createAuthReturnUrlAttempt()
    if (replacement === 'callback') {
      mocks.params = { ...mocks.params, handoff: 'replacement-handoff', state: `callback-state-${++sequence}` }
      await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: mocks.params.state, startedAt: Date.now() }))
      mocks.apiClient.mockResolvedValueOnce({ ...login, wasReactivated: true })
      await act(async () => { tree.update(<AuthCallbackScreen />); await new Promise((resolve) => setTimeout(resolve, 0)) })
      expect(mocks.state).toBe('account')
    }
    await storeAuthReturnUrl('/newer', getAuthReturnUrlAttempt())
    await act(async () => { release(); await Promise.resolve() })
    expect(mocks.epoch).toBe(committedEpoch + (replacement === 'session' ? 1 : 0))
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(await getStoredAuthReturnUrl(getAuthReturnUrlAttempt())).toBe('/newer')
    if (replacement === 'callback') expect(mocks.state).toBe('account')
    act(() => tree.unmount())
  })

  it('does not install credentials after the session changes during exchange', async () => {
    let release!: (response: typeof login) => void
    mocks.apiClient.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const tree = await mount()
    mocks.epoch += 1
    await act(async () => { release(login); await Promise.resolve() })
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => tree.unmount())
  })

  it('exchanges a new App Link after failure without remounting and deduplicates that callback', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('handoff expired'))
    const tree = await mount()
    expect(mocks.state).toBe('failed')
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('auth_callback_failed', {
      level: 'error', tags: { provider: 'apple', reason: 'exchange_failed' },
    })
    mocks.params = { ...mocks.params, handoff: 'retried-handoff', state: `callback-state-${++sequence}` }
    await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: mocks.params.state, startedAt: Date.now() }))
    let release!: (response: typeof login) => void
    mocks.apiClient.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    await act(async () => { tree.update(<AuthCallbackScreen />); await Promise.resolve() })
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(mocks.state).toBe('pending')
    await act(async () => { tree.update(<AuthCallbackScreen />); await Promise.resolve() })
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    await act(async () => { release(login); await Promise.resolve() })
    expect(mocks.login).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/(tabs)')
    act(() => tree.unmount())
  })

  it('ignores an old exchange failure while the new callback awaits account confirmation', async () => {
    let reject!: (error: Error) => void
    mocks.apiClient.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    const tree = await mount()
    mocks.params = { ...mocks.params, handoff: 'new-handoff', state: `callback-state-${++sequence}` }
    await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: mocks.params.state, startedAt: Date.now() }))
    mocks.apiClient.mockResolvedValueOnce({ ...login, wasReactivated: true })
    await act(async () => { tree.update(<AuthCallbackScreen />); await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(mocks.state).toBe('account')
    await act(async () => { reject(new Error('expired old callback')); await Promise.resolve() })
    expect(mocks.state).toBe('account')
    expect(mocks.login).not.toHaveBeenCalled()
    act(() => tree.unmount())
  })
})
