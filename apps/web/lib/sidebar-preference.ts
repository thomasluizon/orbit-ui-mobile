import { captureException } from '@sentry/nextjs'
import { readClientCookie, writeClientCookie } from '@/lib/client-cookie'
import { getPersistStorage } from '@/lib/persist-storage'

export const SIDEBAR_COLLAPSED_COOKIE = 'orbit_sidebar_collapsed'

const LEGACY_SHELL_STORE_KEY = 'orbit-shell-store'

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

export function writeSidebarCollapsedCookie(collapsed: boolean) {
  writeClientCookie(SIDEBAR_COLLAPSED_COOKIE, collapsed ? '1' : '0')
}

function migrateLegacySidebarCollapsed(): boolean {
  const storage = getPersistStorage()
  const raw = storage.getItem(LEGACY_SHELL_STORE_KEY)
  if (raw === null) return false
  storage.removeItem(LEGACY_SHELL_STORE_KEY)
  const collapsed = (JSON.parse(raw as string) as { state?: { sidebarCollapsed?: unknown } } | null)?.state?.sidebarCollapsed
  if (typeof collapsed !== 'boolean') return false
  writeSidebarCollapsedCookie(collapsed)
  return collapsed
}

/**
 * Reads the saved sidebar preference from the cookie. With no cookie, it moves the value that the
 * old zustand `persist` store kept in `localStorage` key `orbit-shell-store` to the cookie, once,
 * and deletes that key. Remove `migrateLegacySidebarCollapsed` when the old key is gone from the fleet.
 * The shell store calls this while its module evaluates: a document that denies the read is reported.
 */
export function readSidebarCollapsedCookie(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const value = readClientCookie(SIDEBAR_COLLAPSED_COOKIE)
    return value === undefined ? migrateLegacySidebarCollapsed() : parseSidebarCollapsed(value)
  } catch (error) {
    captureException(error)
    return false
  }
}
