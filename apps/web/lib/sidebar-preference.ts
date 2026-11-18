export const SIDEBAR_COLLAPSED_COOKIE = 'orbit_sidebar_collapsed'

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === '1'
}

export function readSidebarCollapsedCookie(): boolean {
  if (typeof document === 'undefined') return false
  const match = new RegExp(String.raw`(?:^|; )${SIDEBAR_COLLAPSED_COOKIE}=([^;]*)`).exec(document.cookie)
  return parseSidebarCollapsed(match?.[1])
}

export function writeSidebarCollapsedCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`
}
