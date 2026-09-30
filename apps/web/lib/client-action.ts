'use client'

import { createApiClientError } from '@orbit/shared'
import { unstable_isUnrecognizedActionError } from 'next/navigation'
import { useAppToastStore } from '@/stores/app-toast-store'
import { reportsAccountChanged, type ServerActionResult } from '@/app/actions/action-result'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { translateApiFetchMessage } from '@/lib/api-fetch'
import { getAccountEventOrigin } from '@/lib/account-event-origin'
import { useVersionGateStore } from '@/stores/version-gate-store'

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
    stillCurrent: () => intendedAccountId === getHeldAccountId() && generation === getAccountGeneration(),
    run: <T>(task: () => T) => withAccountIntent(intendedAccountId, task),
  }
}

export function reportAccountChanged(): void {
  const message = translateApiFetchMessage('errors.api.accountChanged')
  if (!message) return
  const reloadLabel = translateApiFetchMessage('errors.api.reload')
  useVersionGateStore.getState().requireReload('accountChanged')
  useAppToastStore.getState().showToast(reloadLabel
    ? { kind: 'neutral', message, actionLabel: reloadLabel, onAction: () => globalThis.location.reload() }
    : { kind: 'neutral', message })
}

export function reportAccountChangedIfNeeded(error: unknown): void {
  if (reportsAccountChanged(error)) reportAccountChanged()
}

export function accountIntentWithOrigin(accountId: string | null): string | null {
  const eventOrigin = getAccountEventOrigin()
  return eventOrigin ? JSON.stringify({ accountId, eventOrigin }) : accountId
}

export async function applyServerActionFailure<T>(result: ServerActionResult<T>): Promise<void> {
  if (!result.ok && reportsAccountChanged(result)) {
    reportAccountChanged()
    throw createApiClientError(result.status, { error: result.error, errorCode: result.code }, result.error)
  }
  if (!result.ok && result.sessionRefreshFailed) {
    await useAuthStore.getState().confirmSessionRefreshFailure()
    return
  }

  await useAuthStore.getState().recoverSessionRefreshFailure()
}

export async function runServerActionResult<T>(
  action: Promise<ServerActionResult<T>>,
): Promise<ServerActionResult<T>> {
  let result: ServerActionResult<T>
  try {
    result = await action
  } catch (error: unknown) {
    if (unstable_isUnrecognizedActionError(error)) {
      const message = translateApiFetchMessage('errors.api.appUpdated')
      const reloadLabel = translateApiFetchMessage('errors.api.reload')
      if (message && reloadLabel) {
        useVersionGateStore.getState().requireReload('appUpdated')
        useAppToastStore.getState().showToast({
          kind: 'neutral', message, actionLabel: reloadLabel, onAction: () => globalThis.location.reload(),
        })
        return new Promise<ServerActionResult<T>>(() => {})
      }
    }
    throw error
  }
  await applyServerActionFailure(result)
  return result
}

export async function runServerAction<T>(
  action: Promise<ServerActionResult<T>>,
): Promise<T> {
  const result = await runServerActionResult(action)
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
    accountIntentWithOrigin(activeAccountIntent === undefined ? getHeldAccountId() : activeAccountIntent),
  ))
}
