import type { useTranslations } from 'next-intl'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { subscriptionSummary } from '@orbit/shared/utils'
import { ProviderHandoff } from './provider-handoff'
import { UsageStats } from './usage-stats'
import { cardSurface, formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function PlayBillingDashboard({
  state,
  status,
  locale,
  usagePercent,
  usageUrgent,
  onManagePlay,
  t,
}: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  onManagePlay: () => void
  t: UpgradeTranslations
}>) {
  if (!status) return null
  const summary = subscriptionSummary(status, null)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-[var(--r-card)] p-6" style={cardSurface}>
        <h1 className="font-display text-[22px] font-medium leading-[1.4] tracking-[-0.02em] text-[var(--fg-1)]">{t(summary.nameKey)}</h1>
        <p className="t-body text-pretty text-[var(--fg-2)]">{t(summary.bodyKey, { limit: status.aiMessagesLimit })}</p>
        {summary.renewal ? <p className="font-mono text-xs text-[var(--fg-2)]">{t(summary.renewalKey, { date: formatBillingDate(summary.renewal, locale) })}</p> : null}
      </section>
      <ProviderHandoff provider="play" state={state} onManage={onManagePlay} t={t} />
      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={status} t={t} />
      <p className="t-secondary text-pretty text-[var(--fg-3)]">{t('upgrade.billing.actions.providerNote')}</p>
    </div>
  )
}
