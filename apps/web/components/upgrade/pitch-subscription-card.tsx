import type { useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { Badge } from '@/components/ui/badge'
import { formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function PitchSubscriptionCard({
  status,
  locale,
  t,
}: Readonly<{
  status: SubscriptionStatus
  locale: string
  t: UpgradeTranslations
}>) {
  const isTrial = status.plan === 'pro' && status.isTrialActive
  if (!isTrial && !status.lapseReason) return null

  const intervalLabel =
    status.subscriptionInterval === 'yearly'
      ? t('upgrade.billing.plan.yearly')
      : status.subscriptionInterval === 'monthly'
        ? t('upgrade.billing.plan.monthly')
        : t('upgrade.billing.plan.pro')
  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale)
    : null

  return (
    <section className="mb-6 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <p className="t-eyebrow m-0 text-[var(--fg-3)]">{t('upgrade.billing.plan.title')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-xl font-medium text-[var(--fg-1)]">{intervalLabel}</h2>
        {isTrial ? <Badge>{t('upgrade.billing.plan.trialBadge')}</Badge> : null}
      </div>
      {isTrial && status.trialEndsAt ? (
        <p className="mt-3 text-sm text-[var(--fg-3)]">
          {t('upgrade.billing.plan.trialHint', {
            date: formatBillingDate(status.trialEndsAt, locale),
          })}
        </p>
      ) : null}
      {status.lapseReason ? (
        <div className="mt-3 flex flex-col gap-2 text-sm leading-5 text-[var(--fg-3)]">
          <p className="font-medium text-[var(--fg-1)]">{t('upgrade.billing.lapsed.title')}</p>
          <p>
            {endedAt
              ? t(`upgrade.billing.lapsed.${status.lapseReason}`, {
                  date: endedAt,
                })
              : t('upgrade.billing.lapsed.fallback')}
          </p>
          <p>{t('upgrade.billing.lapsed.features')}</p>
          {status.subscriptionInterval === 'yearly' ? (
            <p>{t('upgrade.billing.lapsed.yearlyFeature')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
