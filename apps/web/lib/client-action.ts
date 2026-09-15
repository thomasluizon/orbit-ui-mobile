'use client'

import { createApiClientError } from '@orbit/shared'
import type { ServerActionResult } from '@/app/actions/action-result'
import { useAuthStore } from '@/stores/auth-store'

export async function applyServerActionFailure<T>(result: ServerActionResult<T>): Promise<void> {
  if (!result.ok && result.sessionRefreshFailed) {
    await useAuthStore.getState().confirmSessionRefreshFailure()
  }
}

export async function runServerAction<T>(
  action: Promise<ServerActionResult<T>>,
): Promise<T> {
  const result = await action
  if (result.ok) return result.data

  await applyServerActionFailure(result)

  throw createApiClientError(
    result.status,
    { error: result.error, ...(result.code ? { errorCode: result.code } : {}) },
    result.error,
  )
}

export function bindServerAction<Arguments extends unknown[], T>(
  action: (...arguments_: Arguments) => Promise<ServerActionResult<T>>,
): (...arguments_: Arguments) => Promise<T> {
  return (...arguments_) => runServerAction(action(...arguments_))
}
