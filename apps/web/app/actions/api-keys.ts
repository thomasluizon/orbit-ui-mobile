'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import {
  extractBackendError,
  extractBackendErrorCode,
  extractBackendStatus,
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

type ConfirmApiKeyChallengeResult =
  | { success: true }
  | { success: false; errorCode: string | null; remaining: number | null }

export type CreateApiKeyResult =
  | { success: true; response: ApiKeyCreateResponse }
  | { success: false; challengeRequired: true }

export async function createApiKey(
  request: ApiKeyCreateRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<CreateApiKeyResult>> {
  return wrapServerAction(async () => {
    try {
      const response = await serverAuthMutate<ApiKeyCreateResponse>(API.apiKeys.create, {
        method: 'POST',
        body: JSON.stringify(request),
      }, intendedAccountId)
      return { success: true, response }
    } catch (caught: unknown) {
      if (
        extractBackendStatus(caught) === 428
        && extractBackendErrorCode(caught) === 'API_KEY_CREATION_CHALLENGE_REQUIRED'
      ) {
        return { success: false, challengeRequired: true }
      }
      throw caught
    }
  })
}

export async function revokeApiKey(
  keyId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(
    () => serverAuthMutate(API.apiKeys.delete(keyId), { method: 'DELETE' }, intendedAccountId),
  )
}

export async function requestApiKeyCreationChallenge(
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(async () => {
    const response: unknown = await serverAuthMutate(
      API.apiKeys.requestCreationChallenge,
      { method: 'POST' },
      intendedAccountId,
    )
    validateApiResponse(
      response,
      stepUpMessageResponseSchema,
      API.apiKeys.requestCreationChallenge,
    )
  })
}

export async function confirmApiKeyCreationChallenge(
  code: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<ConfirmApiKeyChallengeResult>> {
  return wrapServerAction(async () => {
    try {
      const response: unknown = await serverAuthMutate(
        API.apiKeys.confirmCreationChallenge,
        { method: 'POST', body: JSON.stringify({ code }) },
        intendedAccountId,
      )
      validateApiResponse(
        response,
        stepUpMessageResponseSchema,
        API.apiKeys.confirmCreationChallenge,
      )
      return { success: true }
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
