'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export interface CheckoutResponse {
  url: string
}

export interface PortalResponse {
  url: string
}

export async function createCheckoutSession(
  interval: 'monthly' | 'yearly',
  timeZone?: string | null,
): Promise<CheckoutResponse> {
  const url = timeZone
    ? `${API.subscription.checkout}?timeZone=${encodeURIComponent(timeZone)}`
    : API.subscription.checkout
  return serverAuthFetch(url, {
    method: 'POST',
    headers: timeZone ? { 'x-client-timezone': timeZone } : undefined,
    body: JSON.stringify({ interval }),
  })
}

export async function openCustomerPortal(): Promise<PortalResponse> {
  return serverAuthFetch(API.subscription.portal, { method: 'POST' })
}

export async function claimAdReward(): Promise<{
  bonusMessages: number
  remainingToday: number
  totalBonus: number
  newLimit: number
}> {
  return serverAuthFetch(API.subscription.adReward, { method: 'POST' })
}
