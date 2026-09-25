import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { useOnboardingDraftStore } from './onboarding-draft-store'
import { withSessionCookieLock } from '@/lib/session-cookie-lock'
import { clearSupabaseSession } from '@/lib/supabase'

const EXPIRY_CHECK_INTERVAL = 60 * 1000
let sessionRevalidationQueue: Promise<void> = Promise.resolve()
let sessionRecoveryUser: User | null = null
let sessionOwnershipEpoch = 0
let loginsWaitingForLogout = 0

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
  | { kind: 'active'; expiresAt: number }
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

  const session = (await response.json()) as { expiresAt: number | null }
  return typeof session.expiresAt === 'number'
    ? { kind: 'active', expiresAt: session.expiresAt }
    : { kind: 'inactive' }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  expiresAt: null,
  sessionRefreshFailed: false,

  setAuth: (loginResponse: LoginResponse) => {
    clearSupabaseSession()
    sessionOwnershipEpoch += 1
    sessionRecoveryUser = null
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
    const checkEpoch = sessionOwnershipEpoch
    const session = await readCurrentSession()
    if (checkEpoch !== sessionOwnershipEpoch) return
    if (session.kind === 'active') {
      const user = get().user ?? sessionRecoveryUser
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
      clearSupabaseSession()
      sessionRecoveryUser = null
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
      return
    }
    if (session.kind === 'rejected') {
      clearSupabaseSession()
      sessionRecoveryUser ??= get().user
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
      const user = get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      clearSupabaseSession()
      sessionRecoveryUser = null
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: false,
      })
    }
  }),

  checkSession: async () => {
    const checkEpoch = sessionOwnershipEpoch
    const session = await readCurrentSession()
    if (checkEpoch !== sessionOwnershipEpoch) return
    if (session.kind === 'rejected') {
      await get().confirmSessionRefreshFailure()
      return
    }
    if (session.kind === 'active') {
      const user = get().user ?? sessionRecoveryUser
      sessionRecoveryUser = null
      set({
        isAuthenticated: true,
        user,
        expiresAt: session.expiresAt,
        sessionRefreshFailed: false,
      })
    } else if (session.kind === 'inactive') {
      clearSupabaseSession()
      sessionRecoveryUser = null
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
    const logoutEpoch = sessionOwnershipEpoch
    try {
      await withSessionCookieLock(async () => {
        if (logoutEpoch !== sessionOwnershipEpoch) return
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
        }
      })
    } catch {
      return
    }

    if (logoutEpoch !== sessionOwnershipEpoch) return

    clearSupabaseSession()
    sessionOwnershipEpoch += 1
    sessionRecoveryUser = null
    set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    useOnboardingDraftStore.getState().reset()

    if (loginsWaitingForLogout === 0 && 'location' in globalThis) {
      globalThis.location.href = '/login'
    }
  },
}))
