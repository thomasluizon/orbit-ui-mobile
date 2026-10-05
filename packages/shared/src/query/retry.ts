import { extractBackendStatus, isPayGateError } from '../utils/error-utils'

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isPayGateError(error)) return false
  const status = extractBackendStatus(error)
  if (status === 401 || status === 429) return false
  return failureCount < 3
}
