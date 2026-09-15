export type ServerActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      status: number
      code?: string
      sessionRefreshFailed: boolean
    }

function readNumber(error: unknown, key: string): number | undefined {
  if (typeof error !== 'object' || error === null || !(key in error)) return undefined
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

function readString(error: unknown, key: string): string | undefined {
  if (typeof error !== 'object' || error === null || !(key in error)) return undefined
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function reportsSessionRefreshFailure(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'sessionRefreshFailed' in error
    && (error as { sessionRefreshFailed?: unknown }).sessionRefreshFailed === true
}

export async function wrapServerAction<T>(
  action: () => Promise<T>,
): Promise<ServerActionResult<T>> {
  try {
    return { ok: true, data: await action() }
  } catch (error: unknown) {
    const code = readString(error, 'code')
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: readNumber(error, 'status') ?? 500,
      ...(code ? { code } : {}),
      sessionRefreshFailed: reportsSessionRefreshFailure(error),
    }
  }
}
