export function clearDesignCookie(): void {
  if (!document.cookie.split(';').some((cookie) => cookie.trim().startsWith('orbit_design='))) return

  document.cookie = 'orbit_design=; Max-Age=0; Path=/; Secure; SameSite=Lax'
}
