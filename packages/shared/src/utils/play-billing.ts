import type { SubscriptionInterval } from '../types/profile'

export const PLAY_SUBSCRIPTION_PRODUCT_ID = 'orbit_pro'
export const PLAY_PACKAGE_NAME = 'org.useorbit.app'
export const PLAY_BASE_PLAN_MONTHLY = 'monthly'
export const PLAY_BASE_PLAN_YEARLY = 'yearly'
export const PLAY_REFERRAL_OFFER_TAG = 'referral'

/** Deep link to the Google Play subscription management page for the Orbit Pro product. */
export function playManageSubscriptionUrl(): string {
  return `https://play.google.com/store/account/subscriptions?sku=${PLAY_SUBSCRIPTION_PRODUCT_ID}&package=${PLAY_PACKAGE_NAME}`
}

/** Maps a Google Play base-plan ID to the shared subscription interval, or null if unrecognized. */
export function playBasePlanToInterval(basePlanId: string): SubscriptionInterval | null {
  if (basePlanId === PLAY_BASE_PLAN_MONTHLY) return 'monthly'
  if (basePlanId === PLAY_BASE_PLAN_YEARLY) return 'yearly'
  return null
}
