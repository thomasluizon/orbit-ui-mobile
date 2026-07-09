import {
  applySubscriptionDiscount,
  formatPrice,
} from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { SubscriptionInterval } from '@/components/upgrade/types'

export interface UpgradeSelectedChargeInput {
  plans: SubscriptionPlans | null | undefined
  selectedInterval: SubscriptionInterval
  yearlyDisplayPrice: string | undefined
  monthlyDisplayPrice: string | undefined
}

/**
 * Resolves the display price for the currently selected plan interval, preferring
 * a Play Billing display price and falling back to the discounted plan amount.
 * Pure — returns an empty string until plans have loaded.
 */
export function resolveUpgradeSelectedCharge(
  input: UpgradeSelectedChargeInput,
): string {
  const { plans, selectedInterval, yearlyDisplayPrice, monthlyDisplayPrice } =
    input
  if (!plans) return ''

  if (selectedInterval === 'yearly') {
    return (
      yearlyDisplayPrice ??
      formatPrice(
        applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff),
        plans.currency,
      )
    )
  }

  return (
    monthlyDisplayPrice ??
    formatPrice(
      applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff),
      plans.currency,
    )
  )
}

export interface UpgradeProPanelInput {
  showBilling: boolean
  isPlaySource: boolean
  hasBillingData: boolean
  isBillingLoading: boolean
  isBillingError: boolean
}

/**
 * Derives whether the "no active Stripe subscription" pro panel and the header
 * gradient should show, given the current billing state. Pure.
 */
export function resolveUpgradeProPanelVisibility(input: UpgradeProPanelInput): {
  showsProPanel: boolean
  showGradient: boolean
} {
  const {
    showBilling,
    isPlaySource,
    hasBillingData,
    isBillingLoading,
    isBillingError,
  } = input
  const showsProPanel =
    showBilling &&
    !isPlaySource &&
    !hasBillingData &&
    !isBillingLoading &&
    !isBillingError
  const showGradient = !showBilling || showsProPanel
  return { showsProPanel, showGradient }
}
