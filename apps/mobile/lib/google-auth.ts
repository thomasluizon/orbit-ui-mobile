import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'
import { API } from '@orbit/shared/api'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { isSafeReturnUrl, storeAuthReturnUrl } from './auth-flow'
import { supabase } from './supabase'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'
const APP_ORIGIN = 'https://app.useorbit.org'
const AUTH_CALLBACK_URL = `${APP_ORIGIN}/auth-callback`
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

interface GoogleAuthParams {
  access_token?: string
  refresh_token?: string
  provider_token?: string
  provider_refresh_token?: string
  error?: string
  error_description?: string
  token?: string
  refreshToken?: string
  userId?: string
  name?: string
  email?: string
}

function extractParams(rawUrl: string): GoogleAuthParams {
  const params = new URLSearchParams()

  const [baseUrl, hash = ''] = rawUrl.split('#', 2)
  const url = new URL(baseUrl ?? rawUrl)

  url.searchParams.forEach((value, key) => {
    params.set(key, value)
  })

  if (hash) {
    const hashParams = new URLSearchParams(hash)
    hashParams.forEach((value, key) => {
      params.set(key, value)
    })
  }

  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
    provider_token: params.get('provider_token') ?? undefined,
    provider_refresh_token: params.get('provider_refresh_token') ?? undefined,
    error: params.get('error') ?? undefined,
    error_description: params.get('error_description') ?? undefined,
    token: params.get('token') ?? undefined,
    refreshToken: params.get('refreshToken') ?? undefined,
    userId: params.get('userId') ?? undefined,
    name: params.get('name') ?? undefined,
    email: params.get('email') ?? undefined,
  }
}

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
  const params = extractParams(rawUrl)

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
  language,
  referralCode,
  returnUrl,
}: Readonly<{
  language: string
  referralCode?: string
  returnUrl?: string
}>): Promise<BackendLoginResponse | null> {
  if (returnUrl && isSafeReturnUrl(returnUrl)) {
    await storeAuthReturnUrl(returnUrl)
  }

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

  if (result.type !== 'success' || !result.url) {
    return null
  }

  return completeGoogleAuthFromUrl(result.url, language, referralCode)
}
