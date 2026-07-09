import { describe, expect, it } from 'vitest'
import { applySubscriptionDiscount, formatPrice } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import {
  resolveUpgradeProPanelVisibility,
  resolveUpgradeSelectedCharge,
} from '@/app/upgrade-model'

const plans: SubscriptionPlans = {
  monthly: { unitAmount: 999, currency: 'usd' },
  yearly: { unitAmount: 9999, currency: 'usd' },
  savingsPercent: 20,
  couponPercentOff: null,
  currency: 'usd',
}

describe('resolveUpgradeSelectedCharge', () => {
  it('returns an empty string until plans load', () => {
    expect(
      resolveUpgradeSelectedCharge({
        plans: null,
        selectedInterval: 'yearly',
        yearlyDisplayPrice: 'R$ 99',
        monthlyDisplayPrice: 'R$ 9',
      }),
    ).toBe('')
  })

  it('prefers the Play display price for the selected interval', () => {
    expect(
      resolveUpgradeSelectedCharge({
        plans,
        selectedInterval: 'yearly',
        yearlyDisplayPrice: 'R$ 99',
        monthlyDisplayPrice: 'R$ 9',
      }),
    ).toBe('R$ 99')

    expect(
      resolveUpgradeSelectedCharge({
        plans,
        selectedInterval: 'monthly',
        yearlyDisplayPrice: 'R$ 99',
        monthlyDisplayPrice: 'R$ 9',
      }),
    ).toBe('R$ 9')
  })

  it('falls back to the discounted plan price when no display price exists', () => {
    expect(
      resolveUpgradeSelectedCharge({
        plans,
        selectedInterval: 'yearly',
        yearlyDisplayPrice: undefined,
        monthlyDisplayPrice: undefined,
      }),
    ).toBe(
      formatPrice(
        applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff),
        plans.currency,
      ),
    )

    expect(
      resolveUpgradeSelectedCharge({
        plans,
        selectedInterval: 'monthly',
        yearlyDisplayPrice: undefined,
        monthlyDisplayPrice: undefined,
      }),
    ).toBe(
      formatPrice(
        applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff),
        plans.currency,
      ),
    )
  })
})

describe('resolveUpgradeProPanelVisibility', () => {
  it('shows the pro panel only when billing is active with no Stripe data', () => {
    expect(
      resolveUpgradeProPanelVisibility({
        showBilling: true,
        isPlaySource: false,
        hasBillingData: false,
        isBillingLoading: false,
        isBillingError: false,
      }),
    ).toEqual({ showsProPanel: true, showGradient: true })
  })

  it('hides the pro panel when billing data is present', () => {
    expect(
      resolveUpgradeProPanelVisibility({
        showBilling: true,
        isPlaySource: false,
        hasBillingData: true,
        isBillingLoading: false,
        isBillingError: false,
      }),
    ).toEqual({ showsProPanel: false, showGradient: false })
  })

  it('always shows the gradient when billing is not shown', () => {
    expect(
      resolveUpgradeProPanelVisibility({
        showBilling: false,
        isPlaySource: false,
        hasBillingData: false,
        isBillingLoading: false,
        isBillingError: false,
      }),
    ).toEqual({ showsProPanel: false, showGradient: true })
  })

  it('suppresses the pro panel while billing is loading or errored', () => {
    expect(
      resolveUpgradeProPanelVisibility({
        showBilling: true,
        isPlaySource: false,
        hasBillingData: false,
        isBillingLoading: true,
        isBillingError: false,
      }).showsProPanel,
    ).toBe(false)

    expect(
      resolveUpgradeProPanelVisibility({
        showBilling: true,
        isPlaySource: true,
        hasBillingData: false,
        isBillingLoading: false,
        isBillingError: false,
      }).showsProPanel,
    ).toBe(false)
  })
})
