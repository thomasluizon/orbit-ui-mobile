'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
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
