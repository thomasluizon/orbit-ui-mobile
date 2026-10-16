import { AstraGlyph } from '@/components/ui/astra-glyph'
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
      <section className="flex flex-col gap-4 py-4">
        <AstraGlyph size={96} color="var(--fg-1)" />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 t-display-heading text-balance">{t(summary.nameKey)}</h2>
          {summary.badgeKey ? <Badge>{t(summary.badgeKey)}</Badge> : null}
        </div>
        <p className="t-body text-pretty" style={{ color: 'var(--fg-2)' }}>{t(summary.bodyKey, { limit: status.aiMessagesLimit })}</p>
        {summary.renewal ? <p className="font-mono text-xs text-[var(--fg-2)]">{t(summary.renewalKey, { date: formatBillingDate(summary.renewal, locale) })}</p> : null}
      </section>
      <ProviderHandoff provider="play" state={state} onManage={onManagePlay} t={t} />
      <ProBenefits heading t={t} />
      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={status} t={t} />
      <p className="t-secondary text-pretty text-[var(--fg-3)]">{t('upgrade.billing.actions.providerNote')}</p>
    </div>
  )
}
