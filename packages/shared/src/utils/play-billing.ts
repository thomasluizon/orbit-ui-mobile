import type { SubscriptionInterval } from '../types/profile'

export const PLAY_SUBSCRIPTION_PRODUCT_ID = 'orbit_pro'
export const PLAY_BASE_PLAN_MONTHLY = 'monthly'
export const PLAY_BASE_PLAN_YEARLY = 'yearly'

/** Maps a Google Play base-plan ID to the shared subscription interval, or null if unrecognized. */
export function playBasePlanToInterval(basePlanId: string): SubscriptionInterval | null {
  if (basePlanId === PLAY_BASE_PLAN_MONTHLY) return 'monthly'
  if (basePlanId === PLAY_BASE_PLAN_YEARLY) return 'yearly'
  return null
}
