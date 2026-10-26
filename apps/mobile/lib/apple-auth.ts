import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { z } from 'zod'
import { API } from '@orbit/shared/api'
import { appleHandoffRequestSchema, appleNativeRequestSchema, appleStartResponseSchema, backendLoginResponseSchema } from '@orbit/shared/types/auth'
import { bytesToHex } from '@orbit/shared/utils'
import { AuthCallbackError } from '@orbit/shared/utils/auth-callback-failure'
import { apiClient } from './api-client'
import { AUTH_CALLBACK_URL } from './google-auth-callback'
import { createAuthReturnUrlAttempt, isAuthReturnUrlAttemptCurrent } from './auth-flow'
import { getSessionGeneration, useAuthStore } from '@/stores/auth-store'

const APPLE_ATTEMPT_KEY = 'apple_auth_attempt'
const attemptSchema = z.object({ state: z.string().min(16), startedAt: z.number() })
let pendingAttempt: { state: string; attemptId: string; epoch: number } | null = null
let pendingCompletion: { state: string; promise: ReturnType<typeof exchangeHandoff> } | null = null

export function isAppleAuthConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_APPLE_CLIENT_ID)
}

async function nativeAppleSignIn(language: string, referralCode: string | undefined, isCurrent: () => boolean) {
  const [AppleAuthentication, Crypto] = await Promise.all([import('expo-apple-authentication'), import('expo-crypto')])
  const rawNonce = bytesToHex(await Crypto.getRandomBytesAsync(32))
  const state = bytesToHex(await Crypto.getRandomBytesAsync(32))
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce, { encoding: Crypto.CryptoEncoding.HEX })
  const credential = await AppleAuthentication.signInAsync({
    state, nonce, requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
  })
  if (!isCurrent() || credential.state !== state) throw new Error('Invalid OAuth state')
  const body = appleNativeRequestSchema.parse({ identityToken: credential.identityToken,
    authorizationCode: credential.authorizationCode, rawNonce, language, referralCode,
    givenName: credential.fullName?.givenName ?? undefined, familyName: credential.fullName?.familyName ?? undefined })
  return apiClient(API.auth.appleNative, { method: 'POST', body: JSON.stringify(body), skipAuthRecovery: true, isCurrent }, backendLoginResponseSchema)
}

export async function startAppleAuthentication(options: {
  language: string; referralCode?: string; attemptId: string; isCurrent: () => boolean
}) {
  if (!isAppleAuthConfigured()) throw new Error('Apple sign-in unavailable')
  pendingCompletion = null
  if (Platform.OS === 'ios') return { response: await nativeAppleSignIn(options.language, options.referralCode, options.isCurrent) }
  const Crypto = await import('expo-crypto')
  const state = bytesToHex(await Crypto.getRandomBytesAsync(32))
  pendingAttempt = { state, attemptId: options.attemptId, epoch: getSessionGeneration().epoch }
  await SecureStore.setItemAsync(APPLE_ATTEMPT_KEY, JSON.stringify({ state, startedAt: Date.now() }))
  const start = await apiClient(API.auth.appleStart, { method: 'POST', skipAuthRecovery: true, isCurrent: options.isCurrent,
    body: JSON.stringify({ state, language: options.language, referralCode: options.referralCode }) }, appleStartResponseSchema)
  if (!options.isCurrent()) throw new Error('Authentication session changed')
  const destination = new URL(start.authorizationUrl)
  if (destination.protocol !== 'https:' || destination.hostname !== 'appleid.apple.com' || destination.pathname !== '/auth/authorize') {
    throw new Error('Invalid authorization URL')
  }
  const WebBrowser = await import('expo-web-browser')
  const session = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, AUTH_CALLBACK_URL)
  if (!options.isCurrent() || !isAuthReturnUrlAttemptCurrent(options.attemptId)) return {}
  if (session.type === 'success') {
    const callback = new URL(session.url)
    if (`${callback.origin}${callback.pathname}` !== AUTH_CALLBACK_URL || callback.searchParams.get('provider') !== 'apple'
      || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.get('state') !== state) throw new Error('Invalid OAuth state')
    return { url: session.url }
  }
  if (session.type !== WebBrowser.WebBrowserResultType.DISMISS) {
    pendingAttempt = null
    await SecureStore.deleteItemAsync(APPLE_ATTEMPT_KEY)
  }
  return {}
}

async function exchangeHandoff(handoff: string, state: string) {
  const stored = await SecureStore.getItemAsync(APPLE_ATTEMPT_KEY)
  let attempt: z.infer<typeof attemptSchema>
  try { attempt = attemptSchema.parse(stored ? JSON.parse(stored) : null) }
  catch { throw new AuthCallbackError('state_mismatch') }
  if (attempt.state !== state || attempt.startedAt > Date.now() || Date.now() - attempt.startedAt >= 300_000
    || useAuthStore.getState().isAuthenticated) throw new AuthCallbackError('state_mismatch')
  const owner = pendingAttempt ?? { state, attemptId: createAuthReturnUrlAttempt(), epoch: getSessionGeneration().epoch }
  const isCurrent = () => isAuthReturnUrlAttemptCurrent(owner.attemptId) && owner.epoch === getSessionGeneration().epoch
  if (owner.state !== state || !isCurrent()) throw new AuthCallbackError('session_changed')
  const body = appleHandoffRequestSchema.parse({ handoff, state })
  const response = await apiClient(API.auth.appleHandoff, { method: 'POST', body: JSON.stringify(body), skipAuthRecovery: true, isCurrent }, backendLoginResponseSchema)
  if (!isCurrent()) throw new AuthCallbackError('session_changed')
  await SecureStore.deleteItemAsync(APPLE_ATTEMPT_KEY)
  pendingAttempt = null
  return { response, attemptId: owner.attemptId, epoch: owner.epoch }
}

export function completeAppleHandoff(handoff: string, state: string) {
  if (pendingCompletion?.state === state) return pendingCompletion.promise
  const promise = exchangeHandoff(handoff, state)
  pendingCompletion = { state, promise }
  return promise
}
