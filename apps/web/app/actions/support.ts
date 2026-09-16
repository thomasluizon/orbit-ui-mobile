'use server'

import { API } from '@orbit/shared/api'
import type { SupportRequestBody } from '@orbit/shared/utils/support'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function sendSupportMessage(
  payload: SupportRequestBody,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.support.send, {
    method: 'POST',
    body: JSON.stringify(payload),
  }))
}
