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
import { serverAuthMutate } from '@/lib/server-fetch'
import {
  reportsAccountChanged,
  reportsSessionRefreshFailure,
  wrapServerAction,
  type ServerActionResult,
} from './action-result'

type ConfirmDeletionResult =
  | { success: true; response: AccountDeactivationResponse }
  | { success: false; errorCode: string | null; remaining: number | null }

/**
 * Request account deletion. Sends a confirmation code to the user's email.
 */
export async function requestDeletion(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(async () => {
    const response: unknown = await serverAuthMutate(API.auth.requestDeletion, {
      method: 'POST',
    }, intendedAccountId)
    validateApiResponse(response, stepUpMessageResponseSchema, API.auth.requestDeletion)
  })
}

/**
 * Confirm account deletion with the code received via email.
 * Returns the scheduled deletion response or a serializable expected failure.
 *
 * The account is the one the person was signed in as when they typed the code, not the one the
 * cookie names when this runs. They are the same account until somebody signs in elsewhere, and
 * this is the one request in the app where telling them apart late decides whose account is gone.
 */
export async function confirmDeletion(
  code: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<ConfirmDeletionResult>> {
  return wrapServerAction(async () => {
    try {
      const response: unknown = await serverAuthMutate(API.auth.confirmDeletion, {
        method: 'POST',
        body: JSON.stringify({ code }),
      }, intendedAccountId)
      return {
        success: true,
        response: validateApiResponse(
          response,
          accountDeactivationResponseSchema,
          API.auth.confirmDeletion,
        ),
      }
    } catch (caught: unknown) {
      if (reportsSessionRefreshFailure(caught) || reportsAccountChanged(caught)) throw caught
      return {
        success: false,
        errorCode: extractBackendErrorCode(caught) ?? null,
        remaining: extractStepUpAttemptsRemaining(extractBackendError(caught)),
      }
    }
  })
}
