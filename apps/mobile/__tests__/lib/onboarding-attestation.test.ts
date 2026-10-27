import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Platform } from 'react-native'
import { bindOnboardingSetup } from '@orbit/shared/api'
import { canAttestOnboarding, createOnboardingAttester } from '@/lib/onboarding-attestation'

const originalPlatform = Platform.OS
const integrity = vi.hoisted(() => ({ isSupported: true, prepareIntegrityTokenProviderAsync: vi.fn(), requestIntegrityCheckAsync: vi.fn(), generateKeyAsync: vi.fn(), attestKeyAsync: vi.fn(), generateAssertionAsync: vi.fn() }))
vi.mock('@expo/app-integrity', () => integrity)
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' }, digestStringAsync: (_algorithm: string, binding: string) => Promise.resolve(createHash('sha256').update(binding, 'utf8').digest('base64')) }))

describe('native onboarding proofs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    integrity.isSupported = true
    integrity.requestIntegrityCheckAsync.mockResolvedValue('integrity-token')
    integrity.generateKeyAsync.mockResolvedValue('secure-key-id')
    integrity.attestKeyAsync.mockResolvedValue('attestation-token')
    integrity.generateAssertionAsync.mockResolvedValue('assertion-token')
  })
  afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true }); vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('prepares Play Integrity and hashes the challenge and complete UTF-8 request binding', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    vi.stubEnv('EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER', '123456789')
    expect(canAttestOnboarding()).toBe(true)
    const attester = await createOnboardingAttester()
    expect(await attester.enroll('one-time-challenge')).toEqual({ platform: 'android', token: 'integrity-token' })
    const binding = bindOnboardingSetup('signed-install', 'Ler às 18h 📖', 'pt-BR')
    await attester.assert(binding)
    expect(integrity.prepareIntegrityTokenProviderAsync).toHaveBeenCalledWith('123456789')
    expect(integrity.requestIntegrityCheckAsync.mock.calls).toEqual(['one-time-challenge', binding].map((value) => [createHash('sha256').update(value).digest('base64url')]))
  })

  it('attests a fresh iOS key for each enrollment and signs the exact setup binding', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    const attester = await createOnboardingAttester()
    expect(await attester.enroll('challenge')).toEqual({ platform: 'ios', keyId: 'secure-key-id', token: 'attestation-token' })
    const binding = bindOnboardingSetup('install', 'Read', 'en')
    expect(await attester.assert(binding)).toEqual({ platform: 'ios', keyId: 'secure-key-id', token: 'assertion-token' })
    expect(integrity.attestKeyAsync).toHaveBeenCalledWith('secure-key-id', 'challenge')
    expect(integrity.generateAssertionAsync).toHaveBeenCalledWith('secure-key-id', binding)
    await attester.enroll('new-challenge')
    expect(integrity.generateKeyAsync).toHaveBeenCalledTimes(2)
  })

  it('refuses unsupported App Attest and unconfigured Play Integrity', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    integrity.isSupported = false
    await expect(createOnboardingAttester()).rejects.toThrow('App Attest unavailable')
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    vi.stubEnv('EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER', '')
    expect(canAttestOnboarding()).toBe(false)
    await expect(createOnboardingAttester()).rejects.toThrow('Play Integrity unavailable')
  })
})
