let designReloadRequested = false

export function enableRedesignCookie(): void {
  if (document.cookie.split(';').some((cookie) => cookie.trim() === 'orbit_design=redesign')) return

  document.cookie = 'orbit_design=redesign; Max-Age=31536000; Path=/; Secure; SameSite=Lax'
  if (designReloadRequested) return
  designReloadRequested = true
  globalThis.location.reload()
}

export function clearDesignCookie(): void {
  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
}
