import { ApiClientError } from './error-utils'

export function isMissingBillingStatus(status: number): boolean {
  return status === 404
}

export function isMissingBillingError(error: unknown): boolean {
  return error instanceof ApiClientError && isMissingBillingStatus(error.status)
}
