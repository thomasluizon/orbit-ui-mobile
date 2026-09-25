import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { bindStepUpStateToAccount, clearStepUpState } from '@/lib/step-up-storage'
import {
  announceAccountToOtherTabs,
  subscribeToAccountSignal,
} from '@/lib/cross-tab-account-signal'
import { clearPendingNotificationDeletes } from '@/lib/pending-notification-deletes'
import { getQueryClient } from '@/lib/query-client'
import { advanceAccountGeneration, advanceSessionEpoch, getSessionEpoch } from '@/lib/session-epoch'
import { forgetStoredSupportDraft } from '@/lib/support-draft-storage'
import { clearSupabaseSession } from '@/lib/supabase'
import { useChatStore } from './chat-store'
import { useOnboardingDraftStore } from './onboarding-draft-store'
import { withSessionCookieLock } from '@/lib/session-cookie-lock'

const EXPIRY_CHECK_INTERVAL = 60 * 1000
let sessionRevalidationQueue: Promise<void> = Promise.resolve()
let sessionRecoveryUser: User | null = null
let loginsWaitingForLogout = 0

export async function withCookieSettingLogin<T>(task: () => Promise<T>): Promise<T> {
  loginsWaitingForLogout += 1
  try {
    return await withSessionCookieLock(task)
  } finally {
    loginsWaitingForLogout -= 1
  }
}
let sessionReadVersion = 0

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
 * The content the previous account typed, which is the Astra chat with its stored draft and the
 * stored support draft, empties whenever a session STARTS under an account. That is the point where
 * the person at the keyboard can differ and `lastObservedAccountId` cannot prove it did not: a hard
 * navigation or a closed tab destroys that variable, so a sign out followed by somebody else signing
 * in arrives here with no previous account to compare. A teardown names no account and resets
 * nothing here, so a same-account recovery keeps the half-written message, while `logout` calls the
 * reset itself because a sign out is a definite end rather than a wobble.
 */
function startAccountScopedSession(nextAccountId: string | null): void {
  if (nextAccountId !== null) clearSupabaseSession()
  if (nextAccountId !== null) sessionReadVersion += 1
  const previousAccountId = lastObservedAccountId
  const accountChanged = nextAccountId !== null && previousAccountId !== nextAccountId

  advanceSessionEpoch()
  if (nextAccountId !== null) lastObservedAccountId = nextAccountId
  clearPendingNotificationDeletes()
  if (nextAccountId !== null) forgetPreviousAccountContent()
  if (accountChanged) getQueryClient().clear()
}

/**
 * Drops every unsent thing the previous account left in this tab. Both drafts live under one key
 * with no account in it, so one of them left behind is the next person reading, and sending, text
 * that is not theirs. They reset together rather than at two call sites, because a reset added to
 * one and forgotten at the other is how the support draft outlived the Astra one.
 *
 * The account generation rises here rather than beside it, so the composer state no store can
 * reach, a pasted image and an armed retry, drops on exactly the transitions that drop a draft.
 */
function forgetPreviousAccountContent(): void {
  useChatStore.getState().resetAccountScopedChat()
  forgetStoredSupportDraft()
  advanceAccountGeneration()
}

function clearAccountScopedSessionState(): void {
  clearSupabaseSession()
  startAccountScopedSession(null)
  clearStepUpState()
}

/**
 * Ends the session in this tab, with nothing of the account left behind and no request sent.
 *
 * A sign out in one tab signs the browser out of all of them, so a tab that hears about it has to
 * reach the state the tab that pressed the button reaches, not a lesser version of it. One function
 * so the two callers cannot drift, which is how the support draft once outlived the Astra one.
 */
function endSessionLocally(): void {
  sessionReadVersion += 1
  clearAccountScopedSessionState()
  forgetPreviousAccountContent()
  getQueryClient().clear()
  lastObservedAccountId = null
  sessionRecoveryUser = null
  useOnboardingDraftStore.getState().reset()
}

/**
 * Reads the account the cookie now names. A tab that has not yet learned an account starts a new
 * boundary even on its first check: server-rendered data may belong to a different account if the
 * shared cookie changed between the server render and this check.
 *
 * The step-up state is cleared BEFORE the account generation rises, because the rise is what tells
 * every listener to re-read, and `use-api-key-management` re-reads the creation grant through a
 * lazy initializer at exactly that moment. React happens to defer that render to a microtask, so
 * the other order works, but a grant that lets the next account skip the emailed code should not
 * rest on a flush order nothing states. `endSessionLocally` already clears first.
 */
function adoptSessionAccount(userId: string | null): boolean {
  if (userId === null) return false
  if (lastObservedAccountId === userId) return false
  if (lastObservedAccountId === null) {
    bindStepUpStateToAccount(userId)
    startAccountScopedSession(userId)
    return true
  }

  bindStepUpStateToAccount(userId)
  startAccountScopedSession(userId)
  return true
}

/**
 * Reports the account this tab holds, which is the account any intent formed here belongs to.
 *
 * A write reads it at the moment the person acts and carries it to the server, where the cookie
 * decides. The client counters cannot stand in for this: they count what THIS tab knows, and the
 * defect is that the cookie already changed and the tab does not know yet.
 */
export function getHeldAccountId(): string | null {
  return lastObservedAccountId
}

/**
 * Reports the held account to a component and re-renders it when that account arrives.
 *
 * The first session check can leave `user` null while the held account is known, so subscribers
 * read the held id from the store notification. Every writer sets the id before it calls `set`,
 * so the notification already carries the new answer. The id is a string, which
 * `useSyncExternalStore` compares without a cached snapshot.
 */
export function useHeldAccountId(): string | null {
  return useSyncExternalStore(useAuthStore.subscribe, getHeldAccountId, getHeldAccountId)
}

function queueSessionRevalidation(task: (requestVersion: number) => Promise<void>): Promise<void> {
  const requestVersion = sessionReadVersion
  const next = sessionRevalidationQueue.then(
    () => task(requestVersion),
    () => task(requestVersion),
  )
  sessionRevalidationQueue = next.catch(() => {})
  return next
}

interface AuthState {
  isAuthenticated: boolean
  sessionInactive: boolean
  user: User | null
  expiresAt: number | null
  sessionRefreshFailed: boolean

  setAuth: (loginResponse: LoginResponse) => void
  adoptAccountFromSignal: (accountId: string | null) => void
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
  sessionInactive: false,
  user: null,
  expiresAt: null,
  sessionRefreshFailed: false,

  setAuth: (loginResponse: LoginResponse) => {
    sessionRecoveryUser = null
    bindStepUpStateToAccount(loginResponse.userId)
    startAccountScopedSession(loginResponse.userId)
    set({
      isAuthenticated: true,
      sessionInactive: false,
      user: {
        userId: loginResponse.userId,
        name: loginResponse.name,
        email: loginResponse.email,
      },
      sessionRefreshFailed: false,
    })
    announceAccountToOtherTabs(loginResponse.userId)
  },

  /**
   * Signals trigger cookie reconciliation before publishing authentication or account scope.
   * Their account ids can arrive after later writes, so neither name nor sign-out is proof.
   */
  adoptAccountFromSignal: () => {
    sessionReadVersion += 1
    void get().checkSession()
  },

  confirmSessionRefreshFailure: () => queueSessionRevalidation(async (requestVersion) => {
    if (sessionReadVersion !== requestVersion) return
    const session = await readCurrentSession()
    if (sessionReadVersion !== requestVersion) return
    if (session.kind === 'active') {
      const accountChanged = adoptSessionAccount(session.userId)
      const user = accountChanged ? null : get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        sessionInactive: false,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
      return
    }
    if (session.kind === 'inactive') {
      endSessionLocally()
      set({
        isAuthenticated: false,
        sessionInactive: true,
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
        sessionInactive: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: true,
      })
    }
  }),

  recoverSessionRefreshFailure: () => queueSessionRevalidation(async (requestVersion) => {
    if (sessionReadVersion !== requestVersion) return
    if (!get().sessionRefreshFailed) return

    const session = await readCurrentSession()
    if (sessionReadVersion !== requestVersion) return
    if (session.kind === 'active') {
      const accountChanged = adoptSessionAccount(session.userId)
      const user = accountChanged ? null : get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        sessionInactive: false,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      endSessionLocally()
      set({
        isAuthenticated: false,
        sessionInactive: true,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  }),

  checkSession: async () => {
    const requestVersion = sessionReadVersion
    const session = await readCurrentSession()
    if (sessionReadVersion !== requestVersion) return
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
        sessionInactive: false,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      if (get().sessionInactive) return
      endSessionLocally()
      set({
        isAuthenticated: false,
        sessionInactive: true,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  },

  /**
   * Watches the session two ways. The cross-tab signal arrives the moment another tab replaces the
   * account, and the poll stays as the detector for any browser or context the signal never
   * reaches. The poll is the safety net, not the mechanism, so neither one is removed.
   */
  startExpiryMonitor: () => {
    void get().checkSession()

    const stopAccountSignal = subscribeToAccountSignal((accountId) => {
      get().adoptAccountFromSignal(accountId)
    })

    const intervalId = setInterval(() => {
      const { isAuthenticated, sessionInactive, sessionRefreshFailed } = get()
      if (!isAuthenticated && sessionInactive && !sessionRefreshFailed) {
        return
      }

      void get().checkSession()
    }, EXPIRY_CHECK_INTERVAL)

    return () => {
      stopAccountSignal()
      clearInterval(intervalId)
    }
  },

  logout: async () => {
    const logoutEpoch = getSessionEpoch()
    let teardownEpoch: number | null
    try {
      teardownEpoch = await withSessionCookieLock(async () => {
        if (logoutEpoch !== getSessionEpoch()) return null
        endSessionLocally()
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
        }
        endSessionLocally()
        const currentTeardownEpoch = getSessionEpoch()
        set({
          isAuthenticated: false,
          sessionInactive: true,
          user: null,
          expiresAt: null,
          sessionRefreshFailed: false,
        })
        announceAccountToOtherTabs(null)
        return currentTeardownEpoch
      })
    } catch {
      return
    }

    if (teardownEpoch === null || teardownEpoch !== getSessionEpoch()) return

    if (loginsWaitingForLogout === 0 && 'location' in globalThis) {
      globalThis.location.href = '/login'
    }
  },
}))
