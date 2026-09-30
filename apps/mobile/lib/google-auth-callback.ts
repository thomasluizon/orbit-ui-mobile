import { useSyncExternalStore } from 'react'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'

export const AUTH_CALLBACK_URL = `${APP_LINK_ORIGIN}/auth-callback`

interface PendingGoogleAuthSessionState {
  callbackUrl: string | null
  isPending: boolean
  returnUrlAttemptId: number | null
}

export interface GoogleAuthParams {
  code?: string
  state?: string
  error?: string
  error_description?: string
}

interface ResolveGoogleAuthCallbackUrlInput {
  sessionCallbackUrl?: string | null
  rawUrl?: string | null
  params: Record<string, string | string[] | undefined>
  callbackUrl?: string
}

let pendingGoogleAuthSession: PendingGoogleAuthSessionState = {
  callbackUrl: null, isPending: false, returnUrlAttemptId: null,
}
let pendingCredentials: { verifier: string; state: string } | null = null
let pendingCompletion: { returnUrlAttemptId: number; promise: Promise<void> } | null = null
const listeners = new Set<() => void>()
const errorLoginListeners = new Set<() => void>()
let googleErrorLoginAllowed = false

function emit() { listeners.forEach((listener) => listener()) }
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function snapshot() { return pendingGoogleAuthSession }

export function usePendingGoogleAuthSession() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function allowGoogleErrorLogin(): void {
  googleErrorLoginAllowed = true
  errorLoginListeners.forEach((listener) => listener())
}

export function clearGoogleErrorLogin(): void {
  googleErrorLoginAllowed = false
  errorLoginListeners.forEach((listener) => listener())
}

export function useGoogleErrorLogin(): boolean {
  return useSyncExternalStore(
    (listener) => {
      errorLoginListeners.add(listener)
      return () => { errorLoginListeners.delete(listener) }
    },
    () => googleErrorLoginAllowed,
    () => googleErrorLoginAllowed,
  )
}

export function markPendingGoogleAuthSession(returnUrlAttemptId: number, verifier: string, state: string): void {
  pendingCompletion = null
  pendingCredentials = { verifier, state }
  pendingGoogleAuthSession = { callbackUrl: null, isPending: true, returnUrlAttemptId }
  emit()
}

export function getPendingGoogleAuthVerifier(state: string): string | null {
  return pendingCredentials?.state === state ? pendingCredentials.verifier : null
}

export function hasPendingGoogleAuthSession(): boolean {
  return pendingCredentials !== null
}

export function setPendingGoogleAuthCallbackUrl(callbackUrl: string, returnUrlAttemptId?: number): boolean {
  if (returnUrlAttemptId !== undefined && pendingGoogleAuthSession.returnUrlAttemptId !== returnUrlAttemptId) return false
  if (!pendingCredentials) return false
  const url = new URL(callbackUrl)
  if (`${url.origin}${url.pathname}` !== AUTH_CALLBACK_URL) return false
  if (url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== pendingCredentials.state) return false
  pendingGoogleAuthSession = { ...pendingGoogleAuthSession, callbackUrl, isPending: false }
  emit()
  return true
}

export function clearPendingGoogleAuthSession(returnUrlAttemptId?: number): void {
  if (returnUrlAttemptId !== undefined && pendingGoogleAuthSession.returnUrlAttemptId !== returnUrlAttemptId) return
  pendingCredentials = null
  if (pendingCompletion?.returnUrlAttemptId === pendingGoogleAuthSession.returnUrlAttemptId) return
  pendingCompletion = null
  pendingGoogleAuthSession = { callbackUrl: null, isPending: false, returnUrlAttemptId: null }
  emit()
}

export function completePendingGoogleAuthSession(
  returnUrlAttemptId: number,
  complete: () => Promise<void>,
): Promise<void> {
  if (pendingCompletion?.returnUrlAttemptId === returnUrlAttemptId) return pendingCompletion.promise
  if (pendingGoogleAuthSession.returnUrlAttemptId !== returnUrlAttemptId) return Promise.resolve()
  const promise = Promise.resolve().then(complete)
  pendingCompletion = { returnUrlAttemptId, promise }
  return promise
}

export function extractGoogleAuthParams(rawUrl: string): GoogleAuthParams {
  const params = new URL(rawUrl).searchParams
  return {
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    error_description: params.get('error_description') ?? undefined,
  }
}

export function hasGoogleAuthCallbackPayload(params: Readonly<GoogleAuthParams>): boolean {
  return Boolean(params.code || params.error)
}

export function buildGoogleAuthFallbackUrl(
  params: Record<string, string | string[] | undefined>,
  callbackUrl: string = AUTH_CALLBACK_URL,
): string | null {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return entries.length ? `${callbackUrl}?${new URLSearchParams(entries).toString()}` : null
}

export function resolveGoogleAuthCallbackUrl({
  sessionCallbackUrl, rawUrl, params, callbackUrl = AUTH_CALLBACK_URL,
}: ResolveGoogleAuthCallbackUrlInput): string | null {
  for (const candidate of [sessionCallbackUrl, rawUrl, buildGoogleAuthFallbackUrl(params, callbackUrl)]) {
    if (candidate && hasGoogleAuthCallbackPayload(extractGoogleAuthParams(candidate))) return candidate
  }
  return null
}
