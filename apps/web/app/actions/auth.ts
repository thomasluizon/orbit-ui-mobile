'use server'

import { API } from '@orbit/shared/api'
import {
  accountDeactivationResponseSchema,
  stepUpMessageResponseSchema,
} from '@orbit/shared/types/step-up'
import type { AccountDeactivationResponse } from '@orbit/shared/types/step-up'
import { validateApiResponse } from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(): Promise<void> {
  const response: unknown = await serverAuthFetch(API.auth.requestDeletion, {
    method: 'POST',
  })
  validateApiResponse(response, stepUpMessageResponseSchema, API.auth.requestDeletion)
}

/**
 * Confirm account deletion with the code received via email.
 * Returns the scheduled deletion date from the backend response.
 */
export async function confirmDeletion(code: string): Promise<AccountDeactivationResponse> {
  const response: unknown = await serverAuthFetch(API.auth.confirmDeletion, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return validateApiResponse(
    response,
    accountDeactivationResponseSchema,
    API.auth.confirmDeletion,
  )
}
