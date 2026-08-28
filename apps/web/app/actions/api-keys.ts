'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import { serverAuthFetch } from '@/lib/server-fetch'

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
  await serverAuthFetch(
    API.apiKeys.requestCreationChallenge,
    { method: 'POST' },
    stepUpMessageResponseSchema,
  )
}

export async function confirmApiKeyCreationChallenge(code: string): Promise<void> {
  await serverAuthFetch(
    API.apiKeys.confirmCreationChallenge,
    { method: 'POST', body: JSON.stringify({ code }) },
    stepUpMessageResponseSchema,
  )
}
