export function isMissingBillingStatus(status: number): boolean {
  return status === 404
}

export function isMissingBillingError(error: unknown): boolean {
  return error instanceof Error && /\b404\b/.test(error.message)
}
