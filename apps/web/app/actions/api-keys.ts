'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function createApiKey(
  request: ApiKeyCreateRequest,
): Promise<ServerActionResult<ApiKeyCreateResponse>> {
  return wrapServerAction(() => serverAuthFetch(API.apiKeys.create, {
    method: 'POST',
    body: JSON.stringify(request),
  }))
}

export async function revokeApiKey(keyId: string): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.apiKeys.delete(keyId), { method: 'DELETE' }))
}
