import type { SubscriptionStatus } from '../types/profile'
import type { BillingDetails } from '../types/subscription'

interface SubscriptionSummary {
  nameKey: string
  bodyKey: string
  badgeKey: string | null
  renewal: string | null
  renewalKey: string
}

function planName(interval: string | null, lifetime: boolean): string {
  if (lifetime) return 'upgrade.billing.plan.lifetime'
  if (interval === 'yearly') return 'upgrade.billing.plan.yearly'
  if (interval === 'monthly') return 'upgrade.billing.plan.monthly'
  return 'upgrade.billing.plan.pro'
}

export function subscriptionSummary(status: SubscriptionStatus, billing: BillingDetails | null): SubscriptionSummary {
  const lifetime = status.isLifetimePro
  const canceled = !lifetime && (status.lapseReason === 'canceled' || Boolean(billing?.cancelAtPeriodEnd))
  const pastDue = !lifetime && billing?.status === 'past_due'
  let bodyKey = 'upgrade.billing.plan.proBody'
  let badgeKey: string | null = null
  if (lifetime) {
    bodyKey = 'upgrade.billing.plan.lifetimeHint'
    badgeKey = 'upgrade.billing.plan.lifetimeBadge'
  } else if (canceled) {
    bodyKey = 'upgrade.billing.plan.canceledBody'
    badgeKey = 'upgrade.billing.plan.canceledBadge'
  } else if (pastDue) {
    bodyKey = 'upgrade.billing.plan.pastDueBody'
    badgeKey = 'upgrade.billing.plan.pastDue'
  }
  return {
    nameKey: planName(billing?.interval ?? status.subscriptionInterval, lifetime),
    bodyKey,
    badgeKey,
    renewal: lifetime ? null : billing?.currentPeriodEnd ?? status.planExpiresAt,
    renewalKey: canceled ? 'upgrade.billing.plan.canceledHint' : 'upgrade.billing.plan.renewsOn',
  }
}
