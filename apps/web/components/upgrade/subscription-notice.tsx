import type { useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { UsageStats } from './usage-stats'
import { formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function SubscriptionNotice({ status, locale, onResubscribe, t }: Readonly<{
  status: SubscriptionStatus | null
  locale: string
  onResubscribe?: () => void
  t: UpgradeTranslations
}>) {
  if (!status || status.hasProAccess || (!status.lapseReason && !status.subscriptionEndedAtUtc)) return null
  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale) : null
  const usagePercent = status.aiMessagesLimit > 0 ? Math.min(100, status.aiMessagesUsed / status.aiMessagesLimit * 100) : 0
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <h1 className="font-display text-[22px] font-medium leading-[1.4] text-[var(--fg-1)]">{t('upgrade.billing.lapsed.title')}</h1>
        {endedAt ? <p className="font-mono text-xs text-[var(--fg-3)]">{t('upgrade.billing.lapsed.ended', { date: endedAt })}</p> : null}
        <p className="t-body text-[var(--fg-2)]">{t('upgrade.billing.lapsed.body')}</p>
        <div className="flex flex-col gap-1 text-sm leading-[1.55] text-[var(--fg-3)]">
          <p>{t('upgrade.billing.lapsed.features')}</p>
          {status.subscriptionInterval === 'yearly' ? <p>{t('upgrade.billing.lapsed.yearlyFeature')}</p> : null}
        </div>
        {onResubscribe ? <div className="flex pt-2"><PillButton variant="primary" onClick={onResubscribe}>{t('upgrade.billing.lapsed.action')}</PillButton></div> : null}
      </section>
      <UsageStats usagePercent={usagePercent} usageUrgent={usagePercent >= 80} profile={status} t={t} />
    </div>
  )
}
