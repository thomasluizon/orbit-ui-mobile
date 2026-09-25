'use client'

import { createApiClientError } from '@orbit/shared'
import type { ServerActionResult } from '@/app/actions/action-result'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'

let activeAccountIntent: string | null | undefined

export function withAccountIntent<T>(intendedAccountId: string | null, task: () => T): T {
  const previousIntent = activeAccountIntent
  activeAccountIntent = intendedAccountId
  try {
    return task()
  } finally {
    activeAccountIntent = previousIntent
  }
}

export async function applyServerActionFailure<T>(result: ServerActionResult<T>): Promise<void> {
  if (!result.ok && result.sessionRefreshFailed) {
    await useAuthStore.getState().confirmSessionRefreshFailure()
    return
  }

  await useAuthStore.getState().recoverSessionRefreshFailure()
}

export async function runServerAction<T>(
  action: Promise<ServerActionResult<T>>,
): Promise<T> {
  const result = await action
  await applyServerActionFailure(result)
  if (result.ok) return result.data

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

export function bindAccountServerAction<Arguments extends unknown[], T>(
  action: (...arguments_: [...Arguments, string | null]) => Promise<ServerActionResult<T>>,
): (...arguments_: Arguments) => Promise<T> {
  return (...arguments_) => runServerAction(action(
    ...arguments_,
    activeAccountIntent === undefined ? getHeldAccountId() : activeAccountIntent,
  ))
}
