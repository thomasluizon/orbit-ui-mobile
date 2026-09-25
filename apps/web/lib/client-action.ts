'use client'

import { createApiClientError } from '@orbit/shared'
import { toast } from 'sonner'
import { reportsAccountChanged, type ServerActionResult } from '@/app/actions/action-result'
import { getAccountGeneration, getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { translateApiFetchMessage } from '@/lib/api-fetch'

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

export function captureAccountIntent() {
  const intendedAccountId = getHeldAccountId()
  const generation = getAccountGeneration()
  return {
    intendedAccountId,
    stillCurrent: () => intendedAccountId === getHeldAccountId()
      && generation === getAccountGeneration(),
    run: <T>(task: () => T) => withAccountIntent(intendedAccountId, task),
  }
}

export function reportAccountChanged(): void {
  const message = translateApiFetchMessage('errors.api.accountChanged')
  if (!message) return
  const reloadLabel = translateApiFetchMessage('errors.api.reload')
  toast.error(message, {
    id: 'account-changed',
    duration: Infinity,
    ...(reloadLabel ? { action: { label: reloadLabel, onClick: () => globalThis.location.reload() } } : {}),
  })
}

export function reportAccountChangedIfNeeded(error: unknown): void {
  if (reportsAccountChanged(error)) reportAccountChanged()
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
