import { extractBackendStatus, isPayGateError } from '../utils/error-utils'

const RATE_LIMIT_RETRIES = 6
const MAX_RETRY_DELAY = 120_000

export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header?.trim()) return null
  const value = header.trim()
  if (/^\d+$/.test(value)) return Number(value) * 1000
  if (/^[+-]?\d/.test(value)) return null
  const deadline = Date.parse(value)
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : null
}

export function errorRetryAfter(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('retryAfter' in error)) return null
  return typeof error.retryAfter === 'string' ? parseRetryAfter(error.retryAfter) : null
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isPayGateError(error)) return false
  const status = extractBackendStatus(error)
  if (status === 401) return false
  if (status === 429) {
    return failureCount < RATE_LIMIT_RETRIES && (errorRetryAfter(error) ?? 0) <= MAX_RETRY_DELAY
  }
  return failureCount < 3
}

export function queryRetryDelay(failureCount: number, error: unknown): number {
  if (extractBackendStatus(error) === 429) {
    return Math.min(errorRetryAfter(error) ?? Math.min(5000 * 2 ** failureCount, 30_000), MAX_RETRY_DELAY)
  }
  return Math.min(1000 * 2 ** failureCount, 30_000)
}
