import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'
import { API } from '@orbit/shared/api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { isSafeReturnUrl, storeAuthReturnUrl } from './auth-flow'
import {
  AUTH_CALLBACK_URL,
  extractGoogleAuthParams,
  clearPendingGoogleAuthSession,
  markPendingGoogleAuthSession,
  setPendingGoogleAuthCallbackUrl,
} from './google-auth-callback'
import { supabase } from './supabase'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

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
  const response = await fetch(`${API_BASE}${API.auth.google}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: session.access_token,
      language,
      googleAccessToken: providerToken ?? session.provider_token ?? undefined,
      googleRefreshToken: providerRefreshToken ?? session.provider_refresh_token ?? undefined,
      ...(referralCode ? { referralCode } : {}),
    }),
  })

  const data = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    const errorPayload = data as { error?: string; message?: string } | null
    throw new Error(errorPayload?.error ?? errorPayload?.message ?? 'Authentication failed')
  }

  return data as BackendLoginResponse
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

  const { data, error } = await supabase.auth.setSession({
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
    await supabase.auth.signOut().catch(() => {})
  }
}

export async function startMobileGoogleAuth({
  returnUrl,
}: Readonly<{
  returnUrl?: string
}>): Promise<MobileGoogleAuthResult> {
  if (returnUrl && isSafeReturnUrl(returnUrl)) {
    await storeAuthReturnUrl(returnUrl)
  }

  markPendingGoogleAuthSession()

  try {
    const redirectTo = getGoogleAuthRedirectUrl()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: GOOGLE_SCOPES,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error || !data?.url) {
      throw new Error(error?.message ?? 'Authentication failed')
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (result.type !== 'success') {
      clearPendingGoogleAuthSession()
      return { type: result.type }
    }

    if (!result.url) {
      clearPendingGoogleAuthSession()
      return { type: WebBrowser.WebBrowserResultType.DISMISS }
    }

    const params = extractGoogleAuthParams(result.url)
    if (params.error === 'access_denied') {
      clearPendingGoogleAuthSession()
      return { type: WebBrowser.WebBrowserResultType.CANCEL }
    }

    setPendingGoogleAuthCallbackUrl(result.url)
    return {
      type: 'success',
      url: result.url,
    }
  } catch (error) {
    clearPendingGoogleAuthSession()
    throw error
  }
}
