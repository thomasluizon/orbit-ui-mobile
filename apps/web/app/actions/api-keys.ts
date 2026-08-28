'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import {
  extractBackendError,
  extractBackendErrorCode,
  extractStepUpAttemptsRemaining,
  validateApiResponse,
} from '@orbit/shared/utils'
import { serverAuthFetch } from '@/lib/server-fetch'

type ConfirmApiKeyChallengeResult =
  | { success: true }
  | { success: false; errorCode: string | null; remaining: number | null }

export async function createApiKey(request: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
  return serverAuthFetch(API.apiKeys.create, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await serverAuthFetch(API.apiKeys.delete(keyId), { method: 'DELETE' })
}

export async function requestApiKeyCreationChallenge(): Promise<void> {
  const response: unknown = await serverAuthFetch(
    API.apiKeys.requestCreationChallenge,
    { method: 'POST' },
  )
  validateApiResponse(
    response,
    stepUpMessageResponseSchema,
    API.apiKeys.requestCreationChallenge,
  )
}

export async function confirmApiKeyCreationChallenge(
  code: string,
): Promise<ConfirmApiKeyChallengeResult> {
  try {
    const response: unknown = await serverAuthFetch(
      API.apiKeys.confirmCreationChallenge,
      { method: 'POST', body: JSON.stringify({ code }) },
    )
    validateApiResponse(
      response,
      stepUpMessageResponseSchema,
      API.apiKeys.confirmCreationChallenge,
    )
    return { success: true }
  } catch (caught: unknown) {
    return {
      success: false,
      errorCode: extractBackendErrorCode(caught) ?? null,
      remaining: extractStepUpAttemptsRemaining(extractBackendError(caught)),
    }
  }
}
