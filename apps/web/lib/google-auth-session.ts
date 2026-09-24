const GOOGLE_AUTH_STARTED_AT = 'orbit_google_auth_started_at'
const GOOGLE_AUTH_WINDOW_MS = 10 * 60 * 1000

export function markGoogleAuthStarted(): void {
  sessionStorage.setItem(GOOGLE_AUTH_STARTED_AT, String(Date.now()))
}

export function clearGoogleAuthStarted(): void {
  sessionStorage.removeItem(GOOGLE_AUTH_STARTED_AT)
}

export function consumeRecentGoogleAuthStart(): boolean {
  const raw = sessionStorage.getItem(GOOGLE_AUTH_STARTED_AT)
  clearGoogleAuthStarted()
  if (raw === null) return false
  const startedAt = Number(raw)
  return Number.isFinite(startedAt) && startedAt <= Date.now()
    && Date.now() - startedAt < GOOGLE_AUTH_WINDOW_MS
}
