'use server'

import { API } from '@orbit/shared/api'
import type { SupportRequestBody } from '@orbit/shared/utils/support'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function sendSupportMessage(
  payload: SupportRequestBody, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.support.send, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, intendedAccountId))
}
