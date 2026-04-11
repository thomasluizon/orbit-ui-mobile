'use server'

import { serverAuthFetch } from '@/lib/server-fetch'

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(): Promise<void> {
  await serverAuthFetch('/api/auth/request-deletion', {
    method: 'POST',
  })
}

/**
 * Confirm account deletion with the code received via email.
 * Returns the scheduled deletion date from the backend response.
 */
export async function confirmDeletion(code: string): Promise<{ scheduledDeletionAt?: string }> {
  const response = await serverAuthFetch('/api/auth/confirm-deletion', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return response ?? {}
}
