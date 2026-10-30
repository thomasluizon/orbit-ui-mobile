import { Platform } from 'react-native'
import type { OnboardingAttester } from '@orbit/shared/api'

export function canAttestOnboarding(): boolean {
  return Platform.OS === 'ios' || (Platform.OS === 'android' && Boolean(process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER))
}

async function requestHash(binding: string): Promise<string> {
  const Crypto = await import('expo-crypto')
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, binding, { encoding: Crypto.CryptoEncoding.BASE64 })
  return digest.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function createOnboardingAttester(): Promise<OnboardingAttester> {
  const integrity = await import('@expo/app-integrity')
  if (Platform.OS === 'android') {
    const project: unknown = process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER
    if (typeof project !== 'string' || !/^\d+$/.test(project)) throw new Error('Play Integrity unavailable')
    await integrity.prepareIntegrityTokenProviderAsync(project)
    const prove = async (binding: string) => ({ platform: 'android' as const, token: await integrity.requestIntegrityCheckAsync(await requestHash(binding)) })
    return { platform: 'android', enroll: prove, assert: prove }
  }
  if (Platform.OS !== 'ios' || !integrity.isSupported) throw new Error('App Attest unavailable')
  let keyId = ''
  return {
    platform: 'ios',
    enroll: async (challenge) => {
      keyId = await integrity.generateKeyAsync()
      return { platform: 'ios', keyId, token: await integrity.attestKeyAsync(keyId, challenge) }
    },
    assert: async (binding) => ({ platform: 'ios', keyId, token: await integrity.generateAssertionAsync(keyId, binding) }),
  }
}
