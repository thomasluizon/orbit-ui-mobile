import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { useSyncExternalStore } from 'react'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'
import * as SecureStore from 'expo-secure-store'
import { createAuthReturnUrlAttempt } from './auth-flow'

export const AUTH_CALLBACK_URL = `${APP_LINK_ORIGIN}/auth-callback`
const GOOGLE_AUTH_ATTEMPT_KEY = 'google_auth_attempt'
const GOOGLE_AUTH_ATTEMPT_WINDOW_MS = 10 * 60 * 1000

interface PendingGoogleAuthSessionState {
  callbackUrl: string | null
  isPending: boolean
  returnUrlAttemptId: string | null
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
let pendingAttemptOperation: Promise<void> = Promise.resolve()
export type GoogleAuthCompletion =
  | { status: 'reactivated'; response: BackendLoginResponse; sessionEpoch: number }
  | { status: 'failed' }
  | void

let pendingCompletion: { returnUrlAttemptId: string; promise: Promise<GoogleAuthCompletion> } | null = null
const listeners = new Set<() => void>()
const errorLoginListeners = new Set<() => void>()
let googleErrorLoginAllowed = false

function emit() { listeners.forEach((listener) => listener()) }
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function snapshot() { return pendingGoogleAuthSession }

function queuePendingAttempt(operation: () => Promise<void>): Promise<void> {
  const result = pendingAttemptOperation.then(operation, operation)
  pendingAttemptOperation = result.then(() => {}, () => {})
  return result
}

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

export function markPendingGoogleAuthSession(returnUrlAttemptId: string, verifier: string, state: string): Promise<void> {
  pendingCompletion = null
  pendingCredentials = { verifier, state }
  pendingGoogleAuthSession = { callbackUrl: null, isPending: true, returnUrlAttemptId }
  emit()
  return queuePendingAttempt(() => SecureStore.setItemAsync(GOOGLE_AUTH_ATTEMPT_KEY,
    JSON.stringify({ verifier, state, startedAt: Date.now() })))
}

export function getPendingGoogleAuthVerifier(state: string): string | null {
  return pendingCredentials?.state === state ? pendingCredentials.verifier : null
}

export function hasPendingGoogleAuthSession(): boolean {
  return pendingCredentials !== null
}

export function setPendingGoogleAuthCallbackUrl(callbackUrl: string, returnUrlAttemptId?: string): boolean {
  if (returnUrlAttemptId !== undefined && pendingGoogleAuthSession.returnUrlAttemptId !== returnUrlAttemptId) return false
  if (!pendingCredentials) return false
  const url = new URL(callbackUrl)
  if (`${url.origin}${url.pathname}` !== AUTH_CALLBACK_URL) return false
  if (url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== pendingCredentials.state) return false
  pendingGoogleAuthSession = { ...pendingGoogleAuthSession, callbackUrl, isPending: false }
  emit()
  return true
}

export async function recoverPendingGoogleAuthCallbackUrl(callbackUrl: string): Promise<boolean> {
  await pendingAttemptOperation
  if (pendingCredentials) return setPendingGoogleAuthCallbackUrl(callbackUrl)
  const params = extractGoogleAuthParams(callbackUrl)
  if (!params.state) return false
  const sessionBeforeRead = pendingGoogleAuthSession
  const raw = await SecureStore.getItemAsync(GOOGLE_AUTH_ATTEMPT_KEY)
  if (pendingGoogleAuthSession !== sessionBeforeRead) return pendingGoogleAuthSession.callbackUrl === callbackUrl
  if (!raw) return false
  let stored: unknown
  try { stored = JSON.parse(raw) } catch { return false }
  if (!stored || typeof stored !== 'object') return false
  const record = stored as Record<string, unknown>
  if (typeof record.verifier !== 'string' || typeof record.state !== 'string'
    || typeof record.startedAt !== 'number' || record.state !== params.state
    || record.startedAt > Date.now() || Date.now() - record.startedAt >= GOOGLE_AUTH_ATTEMPT_WINDOW_MS) return false
  const returnUrlAttemptId = createAuthReturnUrlAttempt()
  pendingCredentials = { verifier: record.verifier, state: record.state }
  pendingGoogleAuthSession = { callbackUrl: null, isPending: true, returnUrlAttemptId }
  emit()
  return setPendingGoogleAuthCallbackUrl(callbackUrl, returnUrlAttemptId)
}

export function clearPendingGoogleAuthSessionForLogin(): Promise<void> {
  if (pendingCompletion && pendingCompletion.returnUrlAttemptId === pendingGoogleAuthSession.returnUrlAttemptId) {
    pendingCredentials = null
    return queuePendingAttempt(() => SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY))
  }
  return clearPendingGoogleAuthSession()
}

export function clearPendingGoogleAuthSession(returnUrlAttemptId?: string): Promise<void> {
  if (returnUrlAttemptId !== undefined && pendingGoogleAuthSession.returnUrlAttemptId !== returnUrlAttemptId) return Promise.resolve()
  pendingCredentials = null
  if (returnUrlAttemptId !== undefined && pendingCompletion?.returnUrlAttemptId === returnUrlAttemptId) {
    return queuePendingAttempt(() => SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY))
  }
  pendingCompletion = null
  pendingGoogleAuthSession = { callbackUrl: null, isPending: false, returnUrlAttemptId: null }
  emit()
  return queuePendingAttempt(() => SecureStore.deleteItemAsync(GOOGLE_AUTH_ATTEMPT_KEY))
}

export function completePendingGoogleAuthSession(
  returnUrlAttemptId: string,
  complete: () => Promise<GoogleAuthCompletion>,
): Promise<GoogleAuthCompletion> {
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
