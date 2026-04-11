'use server'

import type { SupportRequestBody } from '@orbit/shared/utils/support'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function sendSupportMessage(payload: SupportRequestBody): Promise<void> {
  await serverAuthFetch('/api/support', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
