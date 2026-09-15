'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.auth.requestDeletion, {
    method: 'POST',
  }))
}

/**
 * Confirm account deletion with the code received via email.
 * Returns the scheduled deletion date from the backend response.
 */
export async function confirmDeletion(
  code: string,
): Promise<ServerActionResult<{ scheduledDeletionAt?: string }>> {
  return wrapServerAction(async () => {
    const response = await serverAuthFetch(API.auth.confirmDeletion, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    return response ?? {}
  })
}
