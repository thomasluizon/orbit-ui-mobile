const GOOGLE_AUTH_STARTED_AT = 'orbit_google_auth_started_at'
const GOOGLE_AUTH_WINDOW_MS = 10 * 60 * 1000

export function markGoogleAuthStarted(): string {
  const attemptId = crypto.randomUUID()
  sessionStorage.setItem(GOOGLE_AUTH_STARTED_AT, `${Date.now()}:${attemptId}`)
  return attemptId
}

export function clearGoogleAuthStarted(): void {
  sessionStorage.removeItem(GOOGLE_AUTH_STARTED_AT)
}

export function consumeRecentGoogleAuthStart(attemptId: string | null): boolean {
  const raw = sessionStorage.getItem(GOOGLE_AUTH_STARTED_AT)
  if (!raw) return false
  const [startedAtRaw, expectedAttemptId] = raw.split(':')
  const startedAt = Number(startedAtRaw)
  const now = Date.now()
  if (!Number.isFinite(startedAt) || startedAt > now || now - startedAt >= GOOGLE_AUTH_WINDOW_MS) {
    clearGoogleAuthStarted()
    return false
  }
  const callbackOwnsMarker = attemptId !== null && attemptId !== '' && attemptId === expectedAttemptId
  if (!callbackOwnsMarker) return false
  clearGoogleAuthStarted()
  return true
}
