'use server'

import { API } from '@orbit/shared/api'
import type { SupportRequestBody } from '@orbit/shared/utils/support'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function sendSupportMessage(payload: SupportRequestBody): Promise<void> {
  await serverAuthFetch(API.support.send, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
