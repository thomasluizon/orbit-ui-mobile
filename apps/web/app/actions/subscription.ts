'use server'

import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export interface PortalResponse {
  url: string
}

export async function openCustomerPortal(intendedAccountId: string | null): Promise<ServerActionResult<PortalResponse>> {
  return wrapServerAction(() => serverAuthMutate(API.subscription.portal, { method: 'POST' }, intendedAccountId))
}
