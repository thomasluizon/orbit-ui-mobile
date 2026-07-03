import { applySubscriptionDiscount, formatLocaleDate } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>
export type SubscriptionInterval = 'monthly' | 'yearly'
export type UpgradeTextFn = (key: string, params?: Record<string, unknown>) => string

export function invoiceStatusColor(status: string, tokens: Tokens): string {
  if (status === 'paid') return tokens.statusDone
  if (status === 'open') return tokens.statusOverdue
  return tokens.fg3
}

export function formatBillingDate(isoDate: string, locale: string) {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function monthlyEquivalentPriceLabel(plans: SubscriptionPlans, yearlyOffer: PlayOffer | null): string {
  if (yearlyOffer?.priceAmountMicros) {
    return formatPrice(
      monthlyEquivalent(Math.round(Number(yearlyOffer.priceAmountMicros) / 10_000)),
      yearlyOffer.currency ?? plans.currency,
    )
  }
  const discountedYearly = applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff)
  return formatPrice(monthlyEquivalent(discountedYearly), plans.currency)
}
