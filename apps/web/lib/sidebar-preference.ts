import { getPersistStorage } from '@/lib/persist-storage'

export const SIDEBAR_COLLAPSED_COOKIE = 'orbit_sidebar_collapsed'

const LEGACY_SHELL_STORE_KEY = 'orbit-shell-store'

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

function readCookieValue(): string | undefined {
  const match = new RegExp(String.raw`(?:^|; )${SIDEBAR_COLLAPSED_COOKIE}=([^;]*)`).exec(document.cookie)
  return match?.[1]
}

export function writeSidebarCollapsedCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`
}

function migrateLegacySidebarCollapsed(): boolean {
  const storage = getPersistStorage()
  const raw = storage.getItem(LEGACY_SHELL_STORE_KEY)
  if (raw === null) return false
  storage.removeItem(LEGACY_SHELL_STORE_KEY)
  let collapsed: unknown
  try {
    collapsed = (JSON.parse(raw as string) as { state?: { sidebarCollapsed?: unknown } } | null)?.state?.sidebarCollapsed
  } catch {
    return false
  }
  if (typeof collapsed !== 'boolean') return false
  writeSidebarCollapsedCookie(collapsed)
  return collapsed
}

/**
 * Reads the saved sidebar preference from the cookie. With no cookie, it moves the value that the
 * old zustand `persist` store kept in `localStorage` key `orbit-shell-store` to the cookie, once,
 * and deletes that key. Remove `migrateLegacySidebarCollapsed` when the old key is gone from the
 * fleet: every client that opened the app after the cookie release has already deleted it.
 */
export function readSidebarCollapsedCookie(): boolean {
  if (typeof document === 'undefined') return false
  const value = readCookieValue()
  return value === undefined ? migrateLegacySidebarCollapsed() : parseSidebarCollapsed(value)
}
