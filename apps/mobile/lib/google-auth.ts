import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import { API } from '@orbit/shared/api'
import { googleCodeAuthResponseSchema, type GoogleCodeAuthResponse } from '@orbit/shared/types/auth'
import { buildGoogleAuthorizeUrl, bytesToHex } from '@orbit/shared/utils'
import { apiClient } from './api-client'
import {
  createAuthReturnUrlAttempt,
  clearStoredAuthReturnUrl,
  isAuthReturnUrlAttemptCurrent,
  isSafeReturnUrl,
  storeAuthReturnUrl,
} from './auth-flow'
import {
  AUTH_CALLBACK_URL,
  extractGoogleAuthParams,
  clearPendingGoogleAuthSession,
  hasPendingGoogleAuthSession,
  getPendingGoogleAuthVerifier,
  markPendingGoogleAuthSession,
  setPendingGoogleAuthCallbackUrl,
} from './google-auth-callback'

export type MobileGoogleAuthResult =
  | { type: 'success'; url: string }
  | { type: WebBrowser.WebBrowserResultType }

let googleAuthStartInProgress = false

export function getGoogleAuthRedirectUrl(): string {
  return AUTH_CALLBACK_URL
}

export async function completeGoogleAuthFromUrl(
  rawUrl: string,
  language: string,
  referralCode?: string,
): Promise<GoogleCodeAuthResponse> {
  const params = extractGoogleAuthParams(rawUrl)
  if (params.error || !params.code || !params.state) throw new Error('Authentication failed')
  const verifier = getPendingGoogleAuthVerifier(params.state)
  if (!verifier) throw new Error('Invalid OAuth state')
  return apiClient<GoogleCodeAuthResponse>(API.auth.googleCode, {
    method: 'POST',
    body: JSON.stringify({
      code: params.code,
      codeVerifier: verifier,
      redirectUri: AUTH_CALLBACK_URL,
      language,
      ...(referralCode ? { referralCode } : {}),
    }),
  }, googleCodeAuthResponseSchema)
}

export async function startMobileGoogleAuth({
  returnUrl,
  forceConsent = false,
}: Readonly<{
  returnUrl?: string
  forceConsent?: boolean
}>): Promise<MobileGoogleAuthResult> {
  if (googleAuthStartInProgress || hasPendingGoogleAuthSession()) {
    throw new Error('Authentication in progress')
  }
  googleAuthStartInProgress = true
  try {
    const returnUrlAttemptId = createAuthReturnUrlAttempt()
    if (returnUrl && isSafeReturnUrl(returnUrl)) {
      await storeAuthReturnUrl(returnUrl, returnUrlAttemptId)
    } else {
      await clearStoredAuthReturnUrl(returnUrlAttemptId)
    }
    if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
      return { type: WebBrowser.WebBrowserResultType.CANCEL }
    }

    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) throw new Error('Google sign-in unavailable')
    const verifier = bytesToHex(await Crypto.getRandomBytesAsync(32))
    const state = bytesToHex(await Crypto.getRandomBytesAsync(32))
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
    const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    markPendingGoogleAuthSession(returnUrlAttemptId, verifier, state)
    const authorizeUrl = buildGoogleAuthorizeUrl({
      clientId, redirectUri: AUTH_CALLBACK_URL, state, codeChallenge,
      purpose: forceConsent ? 'calendar' : 'signin',
    })

    try {
      const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, AUTH_CALLBACK_URL)
      if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
        return { type: WebBrowser.WebBrowserResultType.CANCEL }
      }
      if (result.type !== 'success') {
        clearPendingGoogleAuthSession(returnUrlAttemptId)
        return { type: result.type }
      }
      if (!setPendingGoogleAuthCallbackUrl(result.url, returnUrlAttemptId)) {
        clearPendingGoogleAuthSession(returnUrlAttemptId)
        throw new Error('Invalid OAuth state')
      }
      const params = extractGoogleAuthParams(result.url)
      if (params.error || !params.code) {
        clearPendingGoogleAuthSession(returnUrlAttemptId)
        throw new Error('Authentication failed')
      }
      return { type: 'success', url: result.url }
    } catch (error: unknown) {
      clearPendingGoogleAuthSession(returnUrlAttemptId)
      throw error
    }
  } finally {
    googleAuthStartInProgress = false
  }
}
