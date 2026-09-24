import { useSyncExternalStore } from 'react'

export const AUTH_CALLBACK_URL = 'https://app.useorbit.org/auth-callback'

interface PendingGoogleAuthSessionState {
  callbackUrl: string | null
  isPending: boolean
}

export interface GoogleAuthParams {
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

let pendingGoogleAuthSession: PendingGoogleAuthSessionState = {
  callbackUrl: null,
  isPending: false,
}

const pendingGoogleAuthListeners = new Set<() => void>()

function emitPendingGoogleAuthSession() {
  pendingGoogleAuthListeners.forEach((listener) => listener())
}

function subscribePendingGoogleAuthSession(listener: () => void) {
  pendingGoogleAuthListeners.add(listener)
  return () => {
    pendingGoogleAuthListeners.delete(listener)
  }
}

function getPendingGoogleAuthSessionSnapshot(): PendingGoogleAuthSessionState {
  return pendingGoogleAuthSession
}

export function usePendingGoogleAuthSession() {
  return useSyncExternalStore(
    subscribePendingGoogleAuthSession,
    getPendingGoogleAuthSessionSnapshot,
    getPendingGoogleAuthSessionSnapshot,
  )
}

export function markPendingGoogleAuthSession() {
  pendingGoogleAuthSession = {
    callbackUrl: null,
    isPending: true,
  }
  emitPendingGoogleAuthSession()
}

export function setPendingGoogleAuthCallbackUrl(callbackUrl: string) {
  pendingGoogleAuthSession = {
    callbackUrl,
    isPending: false,
  }
  emitPendingGoogleAuthSession()
}

export function clearPendingGoogleAuthSession() {
  if (!pendingGoogleAuthSession.callbackUrl && !pendingGoogleAuthSession.isPending) {
    return
  }

  pendingGoogleAuthSession = {
    callbackUrl: null,
    isPending: false,
  }
  emitPendingGoogleAuthSession()
}

export function extractGoogleAuthParams(rawUrl: string): GoogleAuthParams {
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
