import type { SubscriptionStatus } from '../types/profile'
import type { BillingDetails } from '../types/subscription'
import { formatLocaleDate } from './locale-format'
import { subscriptionSummary } from './subscription-summary'

/** The Orbit line of the plan question. It names a state, or states the usage fact. It never sells. */
export type UpgradeOrbitLine =
  | { key: 'upgrade.orbitLine.offline' | 'upgrade.orbitLine.loading' | 'upgrade.orbitLine.plansError' }
  | { key: 'upgrade.orbitLine.usage'; used: number; limit: number }

export interface UpgradeOrbitLineInput {
  isOnline: boolean
  isLoadingPlans: boolean
  isPlansError: boolean
  usage: { aiMessagesUsed: number; aiMessagesLimit: number } | null
}

/** A state wins over the usage fact. With no state and no usage read, the line is absent and the block closes up. */
export function resolveUpgradeOrbitLine({ isOnline, isLoadingPlans, isPlansError, usage }: UpgradeOrbitLineInput): UpgradeOrbitLine | null {
  if (!isOnline) return { key: 'upgrade.orbitLine.offline' }
  if (isLoadingPlans) return { key: 'upgrade.orbitLine.loading' }
  if (isPlansError) return { key: 'upgrade.orbitLine.plansError' }
  if (!usage) return null
  return { key: 'upgrade.orbitLine.usage', used: usage.aiMessagesUsed, limit: usage.aiMessagesLimit }
}

/** What the result dialog states after a purchase: the case and the date of the subscription record. */
export interface PurchaseResult {
  key: 'upgrade.result.renews' | 'upgrade.result.ends'
  date: string
}

/** Null until the subscription read reports Pro, and for a record with no date. A trial is not a purchase. */
export function resolvePurchaseResult(status: SubscriptionStatus | null, billing: BillingDetails | null): PurchaseResult | null {
  if (!status?.hasProAccess || status.isTrialActive) return null
  const summary = subscriptionSummary(status, billing)
  if (!summary.renewal) return null
  return {
    key: summary.renewalKey === 'upgrade.billing.plan.canceledHint' ? 'upgrade.result.ends' : 'upgrade.result.renews',
    date: summary.renewal,
  }
}

/** The one sentence of the result dialog. The date reads in the account time zone, or in the zone of the device when the account has none. */
export function formatPurchaseResult(
  result: PurchaseResult,
  locale: string,
  timeZone: string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const date = formatLocaleDate(result.date, locale, { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) })
  return t(result.key, { date })
}
