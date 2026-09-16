export type ServerActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      status: number
      code?: string
      sessionRefreshFailed: boolean
    }

function reportsSessionRefreshFailure(error: unknown): boolean {
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
