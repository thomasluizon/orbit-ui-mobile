import { ProBenefits } from './pro-benefits'
import type { useTranslations } from 'next-intl'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { subscriptionSummary } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { ProviderHandoff } from './provider-handoff'
import { UsageStats } from './usage-stats'
import { formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function PlayBillingDashboard({
  state,
  provider = 'play',
  status,
  locale,
  usagePercent,
  onManagePlay,
  t,
}: Readonly<{
  provider?: 'play' | 'app_store'
  state: SubscriptionScreenState
  status: SubscriptionStatus | null
  locale: string
  usagePercent: number
  onManagePlay: () => void
  t: UpgradeTranslations
}>) {
  if (!status) return null
  const summary = subscriptionSummary(status, null)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 t-display-heading text-balance">{t(summary.nameKey)}</h2>
          {summary.badgeKey ? <Badge>{t(summary.badgeKey)}</Badge> : null}
        </div>
        <p className="t-body text-pretty" style={{ color: 'var(--fg-2)' }}>{t(summary.bodyKey, { limit: status.aiMessagesLimit })}</p>
        {summary.renewal ? <p className="font-mono text-xs text-[var(--fg-2)]">{t(summary.renewalKey, { date: formatBillingDate(summary.renewal, locale) })}</p> : null}
      </section>
      {provider === 'app_store' ? <p className="t-secondary text-pretty text-[var(--fg-2)]">{t('upgrade.appStore.manageOnIphone')}</p> : <ProviderHandoff provider="play" state={state} onManage={onManagePlay} t={t} />}
      <ProBenefits heading t={t} />
      <UsageStats usagePercent={usagePercent} profile={status} t={t} />
      <p className="t-secondary text-pretty text-[var(--fg-3)]">{t('upgrade.billing.actions.providerNote')}</p>
    </div>
  )
}
