import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { bindStepUpStateToAccount, clearStepUpState } from '@/lib/step-up-storage'
import { clearPendingNotificationDeletes } from '@/lib/pending-notification-deletes'
import { getQueryClient } from '@/lib/query-client'
import { advanceSessionEpoch } from '@/lib/session-epoch'
import { useChatStore } from './chat-store'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const EXPIRY_CHECK_INTERVAL = 60 * 1000
let sessionRevalidationQueue: Promise<void> = Promise.resolve()
let sessionRecoveryUser: User | null = null

let lastObservedAccountId: string | null = null

/**
 * The auth cookie belongs to every tab at once, so a sign in elsewhere replaces the account under a
 * tab that keeps running. This is the one path that changes which account the tab holds, and every
 * caller routes through it, because a writer left outside it is how each of the previous rounds left
 * one more hole.
 *
 * Two resets run on EVERY transition, a teardown included, because both are cheap to redo and unsafe
 * to keep. Raising the session epoch stops an in-flight callback the previous account started from
 * writing into the next account's cache, and tells the hooks whose state no store holds to drop it.
 * Dropping the pending notification deletes stops their timers sending a DELETE for the previous
 * account's ids under the next cookie.
 *
 * The other two are gated, on different conditions, because they cost different things:
 *
 * The query cache empties only on a real account change, since a rejected refresh that recovers must
 * not blank a tab full of habits, goals and profile rows.
 *
 * The Astra chat and its stored draft empty whenever a session STARTS under an account, which is the
 * point where the person at the keyboard can differ and `lastObservedAccountId` cannot prove it did
 * not: a hard navigation or a closed tab destroys that variable, so a sign out followed by somebody
 * else signing in arrives here with no previous account to compare. A teardown names no account and
 * resets nothing here, so a same-account recovery keeps the half-written message, while `logout`
 * calls the reset itself because a sign out is a definite end rather than a wobble.
 */
function startAccountScopedSession(nextAccountId: string | null): void {
  const previousAccountId = lastObservedAccountId
  const accountChanged = nextAccountId !== null
    && previousAccountId !== null
    && previousAccountId !== nextAccountId

  advanceSessionEpoch()
  if (nextAccountId !== null) lastObservedAccountId = nextAccountId
  clearPendingNotificationDeletes()
  if (nextAccountId !== null) useChatStore.getState().resetAccountScopedChat()
  if (accountChanged) getQueryClient().clear()
}

function clearAccountScopedSessionState(): void {
  startAccountScopedSession(null)
  clearStepUpState()
}

/**
 * Reads the account the cookie now names. A tab that has not yet learned an account only records it,
 * which leaves a reload of the same account untouched, and a replacement also drops the remembered
 * user because this tab cannot prove the new account's name.
 */
function adoptSessionAccount(userId: string | null): boolean {
  if (userId === null) return false
  if (lastObservedAccountId === userId) return false
  if (lastObservedAccountId === null) {
    lastObservedAccountId = userId
    return false
  }

  startAccountScopedSession(userId)
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
    startAccountScopedSession(loginResponse.userId)
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
    useChatStore.getState().resetAccountScopedChat()
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
