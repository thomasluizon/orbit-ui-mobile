import { useSyncExternalStore } from 'react'
import { uuid } from 'expo-modules-core'
import * as SecureStore from 'expo-secure-store'

export const AUTH_CALLBACK_URL = 'https://app.useorbit.org/auth-callback'
const GOOGLE_AUTH_ATTEMPT_KEY = 'google_auth_attempt'
/** A pending OAuth return expires 10 minutes after its browser attempt starts. */
const GOOGLE_AUTH_ATTEMPT_WINDOW_MS = 10 * 60 * 1000

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
let pendingAttemptOperation = Promise.resolve()

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

function withPendingAttemptLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingAttemptOperation.then(operation)
  pendingAttemptOperation = result.then(() => {}, () => {})
  return result
}

export function markPendingGoogleAuthSession(): Promise<string> {
  return withPendingAttemptLock(async () => {
    const attemptId = uuid.v4()
    await SecureStore.setItemAsync(GOOGLE_AUTH_ATTEMPT_KEY, `${Date.now()}:${attemptId}`)
    pendingGoogleAuthSession = { callbackUrl: null, isPending: true }
    emitPendingGoogleAuthSession()
    return attemptId
  })
}

export function setPendingGoogleAuthCallbackUrl(callbackUrl: string): Promise<boolean> {
  return withPendingAttemptLock(async () => {
    const url = new URL(callbackUrl)
    if (`${url.origin}${url.pathname}` !== AUTH_CALLBACK_URL
      || url.searchParams.getAll('authAttempt').length !== 1) return false

    const raw = await SecureStore.getItemAsync(GOOGLE_AUTH_ATTEMPT_KEY)
    if (!raw) return false
    const [startedAtRaw, expectedAttemptId] = raw.split(':')
    const startedAt = Number(startedAtRaw)
    if (!Number.isFinite(startedAt) || startedAt > Date.now()
      || Date.now() - startedAt >= GOOGLE_AUTH_ATTEMPT_WINDOW_MS) {
      await SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY)
      return false
    }
    if (!expectedAttemptId || url.searchParams.get('authAttempt') !== expectedAttemptId) return false

    await SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY)
    pendingGoogleAuthSession = { callbackUrl, isPending: false }
    emitPendingGoogleAuthSession()
    return true
  })
}

export function clearPendingGoogleAuthSession(): Promise<void> {
  return withPendingAttemptLock(async () => {
    await SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY)
    if (!pendingGoogleAuthSession.callbackUrl && !pendingGoogleAuthSession.isPending) return
    pendingGoogleAuthSession = { callbackUrl: null, isPending: false }
    emitPendingGoogleAuthSession()
  })
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
