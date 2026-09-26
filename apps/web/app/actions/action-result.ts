export type ServerActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      status: number
      code?: string
      sessionRefreshFailed: boolean
    }

/**
 * It lives here rather than in `server-fetch.ts` because the actions that swallow their own
 * errors into a serializable failure have to let this one through, and importing the whole
 * server fetch module to read one string would drag a server-only module into that decision.
 */
export const ACCOUNT_CHANGED_ERROR_CODE = 'ACCOUNT_CHANGED'

/**
 * Reports a write the account guard refused. An action that turns its own failures into `{
 * success: false }` must rethrow this instead: the write did not fail, it never ran, and
 * reporting it as a wrong code would tell the person to try again on an account they are no
 * longer signed in as.
 */
export function reportsAccountChanged(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === ACCOUNT_CHANGED_ERROR_CODE
}

export function reportsSessionRefreshFailure(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'sessionRefreshFailed' in error
    && (error as { sessionRefreshFailed?: unknown }).sessionRefreshFailed === true
}

export async function wrapServerAction<T>(fn: () => Promise<T>): Promise<ServerActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = typeof error === 'object'
      && error !== null
      && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 500
    const code = typeof error === 'object'
      && error !== null
      && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined

    return {
      ok: false,
      error: message,
      status,
      ...(code ? { code } : {}),
      sessionRefreshFailed: reportsSessionRefreshFailure(error),
    }
  }
}
