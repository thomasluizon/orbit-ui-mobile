import { act } from '@testing-library/react'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Drives the one path that changes which account a web tab holds, so a test asserts against the
 * real transition rather than a counter nudged by hand. Every caller stubs `fetch` first, because
 * the session check reads it.
 */
export function respondWithAccount(userId: string): void {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId, refreshFailed: false }),
  } as unknown as Response)
}

export function respondWithInactiveSession(): void {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ expiresAt: null }),
  } as Response)
}

export async function retireHeldAccount(): Promise<void> {
  respondWithInactiveSession()
  await act(async () => {
    await useAuthStore.getState().checkSession()
  })
  vi.mocked(globalThis.fetch).mockClear()
}

/** Signs the tab in as an account, which is where a later replacement is measured from. */
export function holdAccount(userId: string): void {
  useAuthStore.getState().setAuth({
    userId,
    name: 'Ada',
    email: `${userId}@example.com`,
  })
}

/** Replaces the account under the running tab, the way a sign in elsewhere does. */
export async function replaceAccountWith(userId: string): Promise<void> {
  respondWithAccount(userId)
  await act(async () => {
    await useAuthStore.getState().checkSession()
  })
}

/**
 * Rejects the refresh and recovers as the SAME account. The session epoch rises and the account
 * generation does not, so anything the person is still looking at has to survive it.
 */
export async function recoverSameAccount(userId: string): Promise<void> {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ refreshFailed: true }),
  } as unknown as Response)
  await act(async () => {
    await useAuthStore.getState().confirmSessionRefreshFailure()
  })
  respondWithAccount(userId)
  await act(async () => {
    await useAuthStore.getState().recoverSessionRefreshFailure()
  })
}
