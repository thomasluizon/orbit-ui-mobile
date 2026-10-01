import { create } from 'zustand'
import * as Sentry from '@sentry/nextjs'
import { resetAccountQueries } from '@orbit/shared/query'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { startAccountScopedSession } from '@/lib/account-scoped-state'
import { withSessionCookieLock } from '@/lib/session-cookie-lock'
import { getQueryClient } from '@/lib/query-client'
import { identifyPostHogUser, resetPostHogUser } from '@/lib/posthog'

const EXPIRY_CHECK_INTERVAL = 60 * 1000
let sessionRevalidationQueue: Promise<void> = Promise.resolve()
let sessionRecoveryUser: User | null = null
let sessionOwnershipEpoch = 0
let loginsWaitingForLogout = 0
let accountGeneration = 0
let accountSwitchPending = false

export function getAccountGeneration(): number {
  return accountGeneration
}

function reloadWhenCookieReplacesAccount(
  heldAccountId: string | null,
  cookieAccountId: string | null,
): boolean {
  if (!heldAccountId || !cookieAccountId || heldAccountId === cookieAccountId) return false
  if (!accountSwitchPending) {
    accountSwitchPending = true
    accountGeneration += 1
    void resetAccountQueries(getQueryClient(), 'signed-in')
    startAccountScopedSession(heldAccountId, cookieAccountId)
    if ('location' in globalThis) globalThis.location.reload()
  }
  return true
}

export async function withCookieSettingLogin<T>(task: () => Promise<T>): Promise<T> {
  loginsWaitingForLogout += 1
  try {
    return await withSessionCookieLock(task)
  } finally {
    loginsWaitingForLogout -= 1
  }
}

function queueSessionRevalidation(task: () => Promise<void>): Promise<void> {
  const next = sessionRevalidationQueue.then(task, task)
  sessionRevalidationQueue = next.catch(() => {})
  return next
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  heldAccountId: string | null
  expiresAt: number | null
  sessionRefreshFailed: boolean

  setAuth: (loginResponse: LoginResponse) => void
  confirmSessionRefreshFailure: () => Promise<void>
  recoverSessionRefreshFailure: () => Promise<void>
  checkSession: () => Promise<void>
  startExpiryMonitor: () => () => void
  logout: () => Promise<void>
}

type SessionSnapshot =
  | { kind: 'active'; expiresAt: number; accountId: string | null }
  | { kind: 'inactive' }
  | { kind: 'rejected' }
  | { kind: 'retryable' }

async function readCurrentSession(): Promise<SessionSnapshot> {
  let response: Response
  try {
    response = await fetch('/api/auth/session')
  } catch {
    return { kind: 'retryable' }
  }

  if (response.status === 401 || response.status === 403) {
    const session = (await response.json().catch(() => null)) as {
      refreshFailed?: boolean
    } | null
    return session?.refreshFailed === true
      ? { kind: 'rejected' }
      : { kind: 'retryable' }
  }

  if (!response.ok) return { kind: 'retryable' }

  const session = (await response.json()) as { expiresAt: number | null; accountId?: string | null }
  return typeof session.expiresAt === 'number'
    ? { kind: 'active', expiresAt: session.expiresAt, accountId: session.accountId ?? null }
    : { kind: 'inactive' }
}

function getActiveSessionUser(accountId: string | null, user: User | null): User | null {
  if (user?.userId === accountId) return user
  return sessionRecoveryUser?.userId === accountId ? sessionRecoveryUser : null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  heldAccountId: null,
  expiresAt: null,
  sessionRefreshFailed: false,

  setAuth: (loginResponse: LoginResponse) => {
    if (get().heldAccountId && get().heldAccountId !== loginResponse.userId) resetPostHogUser()
    sessionOwnershipEpoch += 1
    accountSwitchPending = false
    accountGeneration += 1
    void resetAccountQueries(getQueryClient(), 'signed-in')
    startAccountScopedSession(get().heldAccountId, loginResponse.userId, true)
    sessionRecoveryUser = null
    set({
      isAuthenticated: true,
      heldAccountId: loginResponse.userId,
      user: {
        userId: loginResponse.userId,
        name: loginResponse.name,
        email: loginResponse.email,
      },
      sessionRefreshFailed: false,
    })
    identifyPostHogUser(loginResponse.userId)
  },

  confirmSessionRefreshFailure: () => queueSessionRevalidation(async () => {
    if (get().sessionRefreshFailed) return
    const checkEpoch = sessionOwnershipEpoch
    const session = await readCurrentSession()
    if (checkEpoch !== sessionOwnershipEpoch) return
    if (session.kind === 'active') {
      if (reloadWhenCookieReplacesAccount(get().heldAccountId, session.accountId)) return
      const accountId = session.accountId ?? get().heldAccountId
      if (get().heldAccountId !== accountId) {
        accountGeneration += 1
        void resetAccountQueries(getQueryClient(), 'signed-in')
        startAccountScopedSession(get().heldAccountId, accountId)
      }
      const user = getActiveSessionUser(accountId, get().user)
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        heldAccountId: accountId,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
      if (accountId) identifyPostHogUser(accountId)
      return
    }
    if (session.kind === 'inactive') {
      resetPostHogUser()
      startAccountScopedSession(get().heldAccountId, null)
      accountGeneration += 1
      void resetAccountQueries(getQueryClient(), 'signed-out')
      sessionRecoveryUser = null
      set({
        isAuthenticated: false,
        heldAccountId: null,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
      return
    }
    if (session.kind === 'rejected') {
      sessionRecoveryUser ??= get().user
      resetPostHogUser()
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: true,
      })
    }
  }),

  recoverSessionRefreshFailure: () => queueSessionRevalidation(async () => {
    if (!get().sessionRefreshFailed) return

    const checkEpoch = sessionOwnershipEpoch
    const session = await readCurrentSession()
    if (checkEpoch !== sessionOwnershipEpoch) return
    if (session.kind === 'active') {
      if (reloadWhenCookieReplacesAccount(get().heldAccountId, session.accountId)) return
      const accountId = session.accountId ?? get().heldAccountId
      if (get().heldAccountId !== accountId) {
        accountGeneration += 1
        void resetAccountQueries(getQueryClient(), 'signed-in')
        startAccountScopedSession(get().heldAccountId, accountId)
      }
      const user = getActiveSessionUser(accountId, get().user)
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        heldAccountId: accountId,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
      if (accountId) identifyPostHogUser(accountId)
    } else if (session.kind === 'inactive') {
      resetPostHogUser()
      startAccountScopedSession(get().heldAccountId, null)
      accountGeneration += 1
      void resetAccountQueries(getQueryClient(), 'signed-out')
      sessionRecoveryUser = null
      set({
        isAuthenticated: false,
        heldAccountId: null,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  }),

  checkSession: async () => {
    if (get().sessionRefreshFailed) return
    const checkEpoch = sessionOwnershipEpoch
    const session = await readCurrentSession()
    if (checkEpoch !== sessionOwnershipEpoch) return
    if (session.kind === 'rejected') {
      await get().confirmSessionRefreshFailure()
      return
    }
    if (session.kind === 'active') {
      if (reloadWhenCookieReplacesAccount(get().heldAccountId, session.accountId)) return
      const accountId = session.accountId ?? get().heldAccountId
      if (get().heldAccountId !== accountId) {
        accountGeneration += 1
        void resetAccountQueries(getQueryClient(), 'signed-in')
        startAccountScopedSession(get().heldAccountId, accountId)
      }
      const user = getActiveSessionUser(accountId, get().user)
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        heldAccountId: accountId,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
      if (accountId) identifyPostHogUser(accountId)
    } else if (session.kind === 'inactive') {
      resetPostHogUser()
      startAccountScopedSession(get().heldAccountId, null)
      accountGeneration += 1
      void resetAccountQueries(getQueryClient(), 'signed-out')
      sessionRecoveryUser = null
      set({
        isAuthenticated: false,
        heldAccountId: null,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  },

  startExpiryMonitor: () => {
    void get().checkSession()

    const intervalId = setInterval(() => {
      if (!get().isAuthenticated) {
        return
      }

      void get().checkSession()
    }, EXPIRY_CHECK_INTERVAL)

    return () => clearInterval(intervalId)
  },

  logout: async () => {
    const logoutEpoch = sessionOwnershipEpoch
    const logoutAccountId = get().heldAccountId
    try {
      await withSessionCookieLock(async () => {
        if (logoutEpoch !== sessionOwnershipEpoch) return
        await import('@/hooks/use-push-notification-preferences')
          .then((module) => module.releasePushSubscription(logoutAccountId))
          .catch((error: unknown) => Sentry.captureException(error))
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
        }
      })
    } catch {
      return
    }

    if (logoutEpoch !== sessionOwnershipEpoch) return

    sessionOwnershipEpoch += 1
    accountSwitchPending = false
    accountGeneration += 1
    void resetAccountQueries(getQueryClient(), 'signed-out')
    startAccountScopedSession(get().heldAccountId, null)
    sessionRecoveryUser = null
    resetPostHogUser()
    set({
      isAuthenticated: false,
      heldAccountId: null,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    if (loginsWaitingForLogout === 0 && 'location' in globalThis) {
      globalThis.location.href = '/login'
    }
  },
}))

export function getHeldAccountId(): string | null {
  return useAuthStore.getState().heldAccountId
}
