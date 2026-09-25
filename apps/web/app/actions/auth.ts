'use server'

import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.auth.requestDeletion, {
    method: 'POST',
  }, intendedAccountId))
}

/**
 * Confirm account deletion with the code received via email.
 * Returns the scheduled deletion date from the backend response.
 */
export async function confirmDeletion(
  code: string, intendedAccountId: string | null
): Promise<ServerActionResult<{ scheduledDeletionAt?: string }>> {
  return wrapServerAction(async () => {
    const response = await serverAuthMutate(API.auth.confirmDeletion, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }, intendedAccountId)
    return response ?? {}
  })
}
