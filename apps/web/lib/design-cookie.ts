let designReloadRequested = false

export function disableRedesignCookie(): void {
  if (!document.cookie.split(';').some((cookie) => cookie.trim().startsWith('orbit_design='))) return

  clearDesignCookie()
  if (designReloadRequested) return
  designReloadRequested = true
  globalThis.location.reload()
}

export function clearDesignCookie(): void {
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
}
