import React from 'react'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import AuthCallbackScreen from '@/app/auth-callback'

const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer

const mocks = vi.hoisted(() => ({
  params: { provider: 'apple', handoff: 'handoff', state: 'callback-state-0001' },
  apiClient: vi.fn(), login: vi.fn(), replace: vi.fn(), state: 'pending', epoch: 0,
}))
vi.mock('expo-linking', () => ({ useLinkingURL: () => null }))
vi.mock('@/lib/google-auth', () => ({ completeGoogleAuthFromUrl: vi.fn() }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params, useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/components/auth/login-content', () => ({ LoginContent: ({ callback }: { callback: { state: string } }) => { mocks.state = callback.state; return null } }))
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
  mocks.state = 'pending'
  mocks.params.state = `callback-state-${++sequence}`
  mocks.epoch += 1
  mocks.apiClient.mockResolvedValue(login)
  mocks.login.mockResolvedValue(() => true)
  await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: mocks.params.state, startedAt: Date.now() }))
})
async function mount() {
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(async () => { tree = TestRenderer.create(<AuthCallbackScreen />); await new Promise((resolve) => setTimeout(resolve, 0)) })
  return tree
}

describe('Apple callback route', () => {
  it('rejects a state mismatch without exchanging or installing a session', async () => {
    mocks.params.state = 'unowned-state-0000'
    const tree = await mount()
    expect(mocks.state).toBe('failed')
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
    act(() => tree.unmount())
  })

  it('installs the exchanged session and consumes the return URL', async () => {
    const tree = await mount()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.appleHandoff, expect.objectContaining({ body: JSON.stringify({ handoff: 'handoff', state: mocks.params.state }) }), expect.anything())
    expect(mocks.login).toHaveBeenCalledWith('session-token', 'refresh-token', expect.objectContaining({ userId: 'account-1' }), mocks.epoch, expect.any(Function))
    expect(mocks.replace).toHaveBeenCalledWith('/(tabs)')
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
})
