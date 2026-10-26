import { createHash } from 'node:crypto'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createAuthReturnUrlAttempt } from '@/lib/auth-flow'
import { completeAppleHandoff, isAppleAuthConfigured, startAppleAuthentication } from '@/lib/apple-auth'

const mocks = vi.hoisted(() => ({ apiClient: vi.fn(), signIn: vi.fn(), browser: vi.fn(), authenticated: false, epoch: 0 }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: mocks.epoch }),
  useAuthStore: { getState: () => ({ isAuthenticated: mocks.authenticated }) },
}))
vi.mock('expo-apple-authentication', () => ({ signInAsync: mocks.signIn,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 } }))
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: mocks.browser, WebBrowserResultType: { DISMISS: 'dismiss' } }))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: () => Promise.resolve(new Uint8Array(32).fill(2)),
  digestStringAsync: (_algorithm: string, input: string) => Promise.resolve(createHash('sha256').update(input).digest('hex')),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { HEX: 'hex' },
}))

const login = { token: 'session-token', refreshToken: 'refresh-token', userId: 'account-1', name: 'Person', email: 'person@example.test', wasReactivated: false }
let attemptId: string
const options = () => ({ language: 'pt-BR', referralCode: 'REF123', attemptId, isCurrent: () => true })

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'services-id')
  Platform.OS = 'ios'
  mocks.authenticated = false
  mocks.epoch = 0
  attemptId = createAuthReturnUrlAttempt()
  await SecureStore.deleteItemAsync('apple_auth_attempt')
  mocks.signIn.mockImplementation((request: { state: string }) => Promise.resolve({
    user: 'apple-user', email: null, fullName: { givenName: 'Person', familyName: null }, realUserStatus: 1,
    state: request.state, authorizationCode: 'single-use-code', identityToken: 'identity-token',
  }))
  mocks.apiClient.mockImplementation((endpoint: string) => Promise.resolve(endpoint === API.auth.appleStart
    ? { authorizationUrl: 'https://appleid.apple.com/auth/authorize?state=server-state' } : login))
  mocks.browser.mockResolvedValue({ type: 'dismiss' })
})
afterEach(() => vi.unstubAllEnvs())

describe('Apple sign-in adapters', () => {
  it('disables sign-in when the public client is absent', async () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', '')
    expect(isAppleAuthConfigured()).toBe(false)
    await expect(startAppleAuthentication(options())).rejects.toThrow('Apple sign-in unavailable')
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('sends the nonce digest to Apple and the raw nonce to the API', async () => {
    expect(await startAppleAuthentication(options())).toEqual({ response: login })
    const rawNonce = '02'.repeat(32)
    expect(mocks.signIn).toHaveBeenCalledWith(expect.objectContaining({ nonce: createHash('sha256').update(rawNonce).digest('hex') }))
    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.appleNative, expect.objectContaining({
      body: JSON.stringify({ identityToken: 'identity-token', authorizationCode: 'single-use-code', rawNonce,
        givenName: 'Person', language: 'pt-BR', referralCode: 'REF123' }), skipAuthRecovery: true,
    }), expect.anything())
  })

  it('rejects a native state mismatch before submitting credentials', async () => {
    mocks.signIn.mockResolvedValue({ state: 'wrong', authorizationCode: 'code', identityToken: 'token', fullName: null })
    await expect(startAppleAuthentication(options())).rejects.toThrow('Invalid OAuth state')
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('preserves a native cancellation for the login owner to dismiss silently', async () => {
    mocks.signIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(startAppleAuthentication(options())).rejects.toEqual({ code: 'ERR_REQUEST_CANCELED' })
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('rejects an Android handoff with a different state', async () => {
    Platform.OS = 'android'
    await startAppleAuthentication(options())
    await expect(completeAppleHandoff('handoff', 'wrong-state-is-long-enough')).rejects.toMatchObject({ reason: 'state_mismatch' })
    expect(mocks.apiClient.mock.calls.map(([endpoint]) => endpoint)).toEqual([API.auth.appleStart])
  })

  it('exchanges an Android App Link handoff once after the browser dismisses', async () => {
    Platform.OS = 'android'
    await startAppleAuthentication(options())
    const state = '02'.repeat(32)
    const first = completeAppleHandoff('handoff', state)
    const second = completeAppleHandoff('handoff', state)
    expect(first).toBe(second)
    expect(await first).toEqual({ response: login, attemptId, epoch: 0 })
    expect(mocks.browser).toHaveBeenCalledWith('https://appleid.apple.com/auth/authorize?state=server-state', expect.stringContaining('/auth-callback'))
    expect(mocks.apiClient).toHaveBeenCalledWith(API.auth.appleHandoff, expect.objectContaining({ body: JSON.stringify({ handoff: 'handoff', state }) }), expect.anything())
    expect(await SecureStore.getItemAsync('apple_auth_attempt')).toBeNull()
  })

  it('rejects a handoff after the session changes', async () => {
    Platform.OS = 'android'
    await startAppleAuthentication(options())
    mocks.epoch += 1
    await expect(completeAppleHandoff('handoff', '02'.repeat(32))).rejects.toMatchObject({ reason: 'session_changed' })
  })

  it('rejects expired persisted state', async () => {
    Platform.OS = 'android'
    await startAppleAuthentication(options())
    await SecureStore.setItemAsync('apple_auth_attempt', JSON.stringify({ state: '02'.repeat(32), startedAt: Date.now() - 300_000 }))
    await expect(completeAppleHandoff('handoff', '02'.repeat(32))).rejects.toMatchObject({ reason: 'state_mismatch' })
  })
})
