'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export interface PortalResponse {
  url: string
}

export async function openCustomerPortal(): Promise<PortalResponse> {
  return serverAuthFetch(API.subscription.portal, { method: 'POST' })
}
