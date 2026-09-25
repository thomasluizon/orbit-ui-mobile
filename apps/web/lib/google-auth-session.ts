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
  clearGoogleAuthStarted()
  if (!raw || !attemptId) return false
  const [startedAtRaw, expectedAttemptId] = raw.split(':')
  const startedAt = Number(startedAtRaw)
  return attemptId === expectedAttemptId && Number.isFinite(startedAt) && startedAt <= Date.now()
    && Date.now() - startedAt < GOOGLE_AUTH_WINDOW_MS
}
