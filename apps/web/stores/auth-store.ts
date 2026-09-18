import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { bindStepUpStateToAccount, clearStepUpState } from '@/lib/step-up-storage'
import { clearPendingNotificationDeletes } from '@/lib/pending-notification-deletes'
import { getQueryClient } from '@/lib/query-client'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const EXPIRY_CHECK_INTERVAL = 60 * 1000
let sessionRevalidationQueue: Promise<void> = Promise.resolve()
let sessionRecoveryUser: User | null = null
let sessionGeneration = 0

/**
 * The one session identity both platforms share. Web counts sessions in a bare number and mobile
 * pairs an epoch with a credential version, so account-scoped work reads this instead of either
 * store's own shape.
 */
export function getSessionEpoch(): number {
  return sessionGeneration
}

let currentAccountId: string | null = null

function clearAccountScopedSessionState(): void {
  sessionGeneration += 1
  currentAccountId = null
  clearPendingNotificationDeletes()
  clearStepUpState()
}

/**
 * The auth cookie belongs to every tab at once, so a sign in elsewhere replaces the account under a
 * tab that keeps running. Nothing account scoped may survive that: the query cache empties because
 * it holds the previous account's notifications, habits, goals and profile and this tab never
 * navigates, so nothing else would evict them; the session generation rises so an in-flight callback
 * started by the previous account cannot write into the new account's cache; the pending
 * notification deletes drop so their timers cannot send a DELETE for the previous account's ids
 * under the new cookie; and the remembered user goes because this tab cannot prove the new account's
 * name. A tab that has not yet learned an account only records it, which leaves a reload of the same
 * account untouched.
 */
function adoptSessionAccount(userId: string | null): boolean {
  if (userId === null) return false

  const previousAccountId = currentAccountId
  if (previousAccountId === userId) return false
  if (previousAccountId === null) {
    currentAccountId = userId
    return false
  }

  clearAccountScopedSessionState()
  getQueryClient().clear()
  currentAccountId = userId
  bindStepUpStateToAccount(userId)
  return true
}

function queueSessionRevalidation(task: () => Promise<void>): Promise<void> {
  const next = sessionRevalidationQueue.then(task, task)
  sessionRevalidationQueue = next.catch(() => {})
  return next
}

interface AuthState {
  isAuthenticated: boolean
  user: User | null
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
  | { kind: 'active'; expiresAt: number; userId: string | null }
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

  const session = (await response.json()) as { expiresAt: number | null; userId?: string | null }
  return typeof session.expiresAt === 'number'
    ? { kind: 'active', expiresAt: session.expiresAt, userId: session.userId ?? null }
    : { kind: 'inactive' }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  expiresAt: null,
  sessionRefreshFailed: false,

  setAuth: (loginResponse: LoginResponse) => {
    sessionRecoveryUser = null
    sessionGeneration += 1
    currentAccountId = loginResponse.userId
    clearPendingNotificationDeletes()
    bindStepUpStateToAccount(loginResponse.userId)
    set({
      isAuthenticated: true,
      user: {
        userId: loginResponse.userId,
        name: loginResponse.name,
        email: loginResponse.email,
      },
      sessionRefreshFailed: false,
    })
  },

  confirmSessionRefreshFailure: () => queueSessionRevalidation(async () => {
    const session = await readCurrentSession()
    if (session.kind === 'active') {
      const accountChanged = adoptSessionAccount(session.userId)
      const user = accountChanged ? null : get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
      return
    }
    if (session.kind === 'inactive') {
      sessionRecoveryUser = null
      clearAccountScopedSessionState()
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
      return
    }
    if (session.kind === 'rejected') {
      sessionRecoveryUser ??= get().user
      clearAccountScopedSessionState()
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

    const session = await readCurrentSession()
    if (session.kind === 'active') {
      const accountChanged = adoptSessionAccount(session.userId)
      const user = accountChanged ? null : get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      sessionRecoveryUser = null
      clearAccountScopedSessionState()
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  }),

  checkSession: async () => {
    const session = await readCurrentSession()
    if (session.kind === 'rejected') {
      await get().confirmSessionRefreshFailure()
      return
    }
    if (session.kind === 'active') {
      const accountChanged = adoptSessionAccount(session.userId)
      const user = accountChanged ? null : get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      sessionRecoveryUser = null
      clearAccountScopedSessionState()
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  },

  startExpiryMonitor: () => {
    void get().checkSession()

    const intervalId = setInterval(() => {
      const { isAuthenticated, sessionRefreshFailed } = get()
      if (!isAuthenticated && !sessionRefreshFailed) {
        return
      }

      void get().checkSession()
    }, EXPIRY_CHECK_INTERVAL)

    return () => clearInterval(intervalId)
  },

  logout: async () => {
    clearAccountScopedSessionState()
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
    }

    sessionRecoveryUser = null
    set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    useOnboardingDraftStore.getState().reset()

    if ('location' in globalThis) {
      globalThis.location.href = '/login'
    }
  },
}))
