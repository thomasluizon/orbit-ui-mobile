export function getErrorMessage(_err: unknown, fallback: string): string {
  return fallback
}

export function extractBackendError(_err: unknown): string | undefined {
  return undefined
}
