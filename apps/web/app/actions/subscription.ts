'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export interface PortalResponse {
  url: string
}

export async function openCustomerPortal(): Promise<ServerActionResult<PortalResponse>> {
  return wrapServerAction(() => serverAuthFetch(API.subscription.portal, { method: 'POST' }))
}
