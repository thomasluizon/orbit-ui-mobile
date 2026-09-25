'use server'

import { API } from '@orbit/shared/api'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function createApiKey(
  request: ApiKeyCreateRequest, intendedAccountId: string | null
): Promise<ServerActionResult<ApiKeyCreateResponse>> {
  return wrapServerAction(() => serverAuthMutate(API.apiKeys.create, {
    method: 'POST',
    body: JSON.stringify(request),
  }, intendedAccountId))
}

export async function revokeApiKey(keyId: string, intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.apiKeys.delete(keyId), { method: 'DELETE' }, intendedAccountId))
}
