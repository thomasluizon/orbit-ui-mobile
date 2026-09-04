import type { useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function SubscriptionNotice({
  status,
  locale,
  t,
}: Readonly<{
  status: SubscriptionStatus | null
  locale: string
  t: UpgradeTranslations
}>) {
  if (!status?.lapseReason) return null

  if (status.hasProAccess) {
    if (status.lapseReason !== 'payment_failed') return null
    return (
      <section className="rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <h2 className="m-0 text-base font-medium text-[var(--fg-1)]">
          {t('upgrade.billing.paymentIssue.title')}
        </h2>
        <p className="mt-2 text-sm leading-5 text-[var(--fg-3)]">
          {t('upgrade.billing.paymentIssue.body')}
        </p>
      </section>
    )
  }

  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale)
    : null

  return (
    <section className="rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <h2 className="m-0 text-base font-medium text-[var(--fg-1)]">
        {t('upgrade.billing.lapsed.title')}
      </h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-5 text-[var(--fg-3)]">
        <p>
          {endedAt
            ? t(`upgrade.billing.lapsed.${status.lapseReason}`, { date: endedAt })
            : t('upgrade.billing.lapsed.fallback')}
        </p>
        <p>{t('upgrade.billing.lapsed.features')}</p>
        {status.subscriptionInterval === 'yearly' ? (
          <p>{t('upgrade.billing.lapsed.yearlyFeature')}</p>
        ) : null}
      </div>
    </section>
  )
}
