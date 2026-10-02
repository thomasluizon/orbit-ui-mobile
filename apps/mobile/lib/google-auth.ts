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
  dismissPendingGoogleAuthSession,
  getPendingGoogleAuthVerifier,
  markPendingGoogleAuthSession,
  setPendingGoogleAuthCallbackUrl,
} from './google-auth-callback'

export type MobileGoogleAuthResult =
  | { type: 'success'; url: string }
  | { type: 'denied'; url: string }
  | { type: 'dismiss'; returnUrlAttemptId: string }
  | { type: Exclude<WebBrowser.WebBrowserResultType, WebBrowser.WebBrowserResultType.DISMISS> }

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

async function openGoogleAuthSession(authorizeUrl: string, returnUrlAttemptId: string): Promise<MobileGoogleAuthResult> {
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, AUTH_CALLBACK_URL)
  if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
    return { type: WebBrowser.WebBrowserResultType.CANCEL }
  }
  let callbackUrl: string
  if (result.type === WebBrowser.WebBrowserResultType.DISMISS) {
    const acceptedCallback = dismissPendingGoogleAuthSession(returnUrlAttemptId)
    if (!acceptedCallback) return { type: 'dismiss', returnUrlAttemptId }
    callbackUrl = acceptedCallback
  } else if (result.type !== 'success') {
    await clearPendingGoogleAuthSession(returnUrlAttemptId)
    return { type: result.type }
  } else {
    if (!setPendingGoogleAuthCallbackUrl(result.url, returnUrlAttemptId)) {
      throw new Error('Invalid OAuth state')
    }
    callbackUrl = result.url
  }
  const params = extractGoogleAuthParams(callbackUrl)
  if (params.error === 'access_denied') {
    await clearPendingGoogleAuthSession(returnUrlAttemptId)
    return { type: 'denied', url: callbackUrl }
  }
  if (params.error || !params.code) throw new Error('Authentication failed')
  return { type: 'success', url: callbackUrl }
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
  let returnUrlAttemptId: string | null = null
  try {
    returnUrlAttemptId = createAuthReturnUrlAttempt()
    if (returnUrl && isSafeReturnUrl(returnUrl)) {
      await storeAuthReturnUrl(returnUrl, returnUrlAttemptId)
    } else {
      await clearStoredAuthReturnUrl(returnUrlAttemptId)
    }
    if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
      return { type: WebBrowser.WebBrowserResultType.CANCEL }
    }

    const configuredClientId: unknown = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
    const clientId = typeof configuredClientId === 'string' ? configuredClientId : undefined
    if (!clientId) throw new Error('Google sign-in unavailable')
    const verifier = bytesToHex(await Crypto.getRandomBytesAsync(32))
    const state = bytesToHex(await Crypto.getRandomBytesAsync(32))
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    })
    let paddingStart = digest.length
    while (paddingStart > 0 && digest[paddingStart - 1] === '=') paddingStart -= 1
    const codeChallenge = digest.slice(0, paddingStart).replaceAll('+', '-').replaceAll('/', '_')
    await markPendingGoogleAuthSession(returnUrlAttemptId, verifier, state)
    const authorizeUrl = buildGoogleAuthorizeUrl({
      clientId, redirectUri: AUTH_CALLBACK_URL, state, codeChallenge,
      purpose: forceConsent ? 'calendar' : 'signin',
    })

    return await openGoogleAuthSession(authorizeUrl, returnUrlAttemptId)
  } catch (error: unknown) {
    if (returnUrlAttemptId !== null) {
      await clearPendingGoogleAuthSession(returnUrlAttemptId).catch(() => undefined)
    }
    throw error
  } finally {
    googleAuthStartInProgress = false
  }
}
