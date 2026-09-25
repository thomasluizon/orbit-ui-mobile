import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'
import { API } from '@orbit/shared/api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { buildGoogleCalendarOAuthOptions } from '@orbit/shared/utils'
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
  markPendingGoogleAuthSession,
  setPendingGoogleAuthCallbackUrl,
} from './google-auth-callback'
import { getSupabaseClient } from './supabase'

export type MobileGoogleAuthResult =
  | { type: 'success'; url: string }
  | { type: WebBrowser.WebBrowserResultType }

async function exchangeGoogleSession(
  session: Session,
  language: string,
  referralCode?: string,
  providerToken?: string,
  providerRefreshToken?: string,
): Promise<BackendLoginResponse> {
  return apiClient<BackendLoginResponse>(API.auth.google, {
    method: 'POST',
    body: JSON.stringify({
      accessToken: session.access_token,
      language,
      googleAccessToken: providerToken ?? session.provider_token ?? undefined,
      googleRefreshToken: providerRefreshToken ?? session.provider_refresh_token ?? undefined,
      ...(referralCode ? { referralCode } : {}),
    }),
  })
}

export function getGoogleAuthRedirectUrl(): string {
  return AUTH_CALLBACK_URL
}

export async function completeGoogleAuthFromUrl(
  rawUrl: string,
  language: string,
  referralCode?: string,
): Promise<BackendLoginResponse> {
  const params = extractGoogleAuthParams(rawUrl)

  if (params.error_description || params.error) {
    throw new Error(params.error_description ?? params.error ?? 'Authentication failed')
  }

  if (params.token && params.userId && params.name && params.email) {
    return {
      token: params.token,
      refreshToken: params.refreshToken ?? null,
      userId: params.userId,
      name: params.name,
      email: params.email,
    }
  }

  if (!params.access_token || !params.refresh_token) {
    throw new Error('Authentication failed')
  }

  const { data, error } = await getSupabaseClient().auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  })

  if (error || !data.session) {
    throw new Error(error?.message ?? 'Authentication failed')
  }

  try {
    return await exchangeGoogleSession(
      data.session,
      language,
      referralCode,
      params.provider_token,
      params.provider_refresh_token,
    )
  } finally {
    await getSupabaseClient().auth.signOut().catch(() => {})
  }
}

export async function startMobileGoogleAuth({
  returnUrl,
  forceConsent = false,
}: Readonly<{
  returnUrl?: string
  forceConsent?: boolean
}>): Promise<MobileGoogleAuthResult> {
  const returnUrlAttemptId = createAuthReturnUrlAttempt()
  if (returnUrl && isSafeReturnUrl(returnUrl)) {
    await storeAuthReturnUrl(returnUrl, returnUrlAttemptId)
  } else {
    await clearStoredAuthReturnUrl(returnUrlAttemptId)
  }
  if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
    return { type: WebBrowser.WebBrowserResultType.CANCEL }
  }

  const attemptId = await markPendingGoogleAuthSession(returnUrlAttemptId)

  try {
    const redirectTo = `${getGoogleAuthRedirectUrl()}?authAttempt=${attemptId}`
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: buildGoogleCalendarOAuthOptions({
        redirectTo,
        skipBrowserRedirect: true,
        forceConsent,
      }),
    })

    if (error || !data.url) {
      throw new Error(error?.message ?? 'Authentication failed')
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) {
      return { type: WebBrowser.WebBrowserResultType.CANCEL }
    }

    if (result.type !== 'success') {
      await clearPendingGoogleAuthSession(returnUrlAttemptId)
      return { type: result.type }
    }

    if (!result.url) {
      await clearPendingGoogleAuthSession(returnUrlAttemptId)
      return { type: WebBrowser.WebBrowserResultType.DISMISS }
    }

    const params = extractGoogleAuthParams(result.url)
    if (params.error === 'access_denied') {
      await clearPendingGoogleAuthSession(returnUrlAttemptId)
      return { type: WebBrowser.WebBrowserResultType.CANCEL }
    }

    if (!await setPendingGoogleAuthCallbackUrl(result.url, returnUrlAttemptId)) {
      await clearPendingGoogleAuthSession(returnUrlAttemptId)
      return { type: WebBrowser.WebBrowserResultType.DISMISS }
    }
    return {
      type: 'success',
      url: result.url,
    }
  } catch (error: unknown) {
    await clearPendingGoogleAuthSession(returnUrlAttemptId)
    throw error
  }
}
