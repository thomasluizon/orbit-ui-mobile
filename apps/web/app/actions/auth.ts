'use server'

import { API } from '@orbit/shared/api'
import {
  accountDeactivationResponseSchema,
  stepUpMessageResponseSchema,
} from '@orbit/shared/types/step-up'
import type { AccountDeactivationResponse } from '@orbit/shared/types/step-up'
import {
  extractBackendError,
  extractBackendErrorCode,
  extractStepUpAttemptsRemaining,
  validateApiResponse,
} from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'

type ConfirmDeletionResult =
  | { success: true; response: AccountDeactivationResponse }
  | { success: false; errorCode: string | null; remaining: number | null }

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
 * Returns the scheduled deletion response or a serializable expected failure.
 */
export async function confirmDeletion(code: string): Promise<ConfirmDeletionResult> {
  try {
    const response: unknown = await serverAuthFetch(API.auth.confirmDeletion, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    return {
      success: true,
      response: validateApiResponse(
        response,
        accountDeactivationResponseSchema,
        API.auth.confirmDeletion,
      ),
    }
  } catch (caught: unknown) {
    return {
      success: false,
      errorCode: extractBackendErrorCode(caught) ?? null,
      remaining: extractStepUpAttemptsRemaining(extractBackendError(caught)),
    }
  }
}
