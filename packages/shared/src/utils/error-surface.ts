import { extractBackendRequestId, extractBackendStatus } from './error-utils'

export function getErrorSurface(error: unknown): { requestId: string | null; retryAt: number | null } {
  const requestId = extractBackendRequestId(error) ?? null
  if (extractBackendStatus(error) !== 429 || !error || typeof error !== 'object') {
    return { requestId, retryAt: null }
  }
  const payload = 'data' in error ? error.data : error
  const retryAfterUtc = payload && typeof payload === 'object' && 'retryAfterUtc' in payload
    ? payload.retryAfterUtc : null
  const isTimestamp = typeof retryAfterUtc === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(retryAfterUtc)
  const retryAt = isTimestamp ? Date.parse(retryAfterUtc) : NaN
  return { requestId, retryAt: Number.isFinite(retryAt) ? retryAt : null }
}

export function getRetryCountdown(retryAt: number, now: number): { seconds: number; label: string } {
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  return { seconds, label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
}
