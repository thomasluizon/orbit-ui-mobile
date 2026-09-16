export const SESSION_REFRESH_HEADER = 'x-orbit-session-refresh'
export const SESSION_REFRESH_FAILED_VALUE = 'failed'

export function buildSessionRefreshHeaders(refreshFailed: boolean): Record<string, string> {
  return refreshFailed
    ? { [SESSION_REFRESH_HEADER]: SESSION_REFRESH_FAILED_VALUE }
    : {}
}

export function responseReportsSessionRefreshFailure(response: Response): boolean {
  return new Headers(response.headers).get(SESSION_REFRESH_HEADER) === SESSION_REFRESH_FAILED_VALUE
}
