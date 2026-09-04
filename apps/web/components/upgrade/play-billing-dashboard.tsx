import type { useTranslations } from 'next-intl'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { playManageSubscriptionUrl } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { PitchSubscriptionCard } from './pitch-subscription-card'
import { UsageStats } from './usage-stats'
import { cardLabelStyle, cardSurface, formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

export function PlayBillingDashboard({
  state,
  status,
  locale,
  usagePercent,
  usageUrgent,
  t,
}: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  t: UpgradeTranslations
}>) {
  if (!status) return null
  const interval = status.subscriptionInterval
  const planLabel = interval === 'yearly'
    ? t('upgrade.billing.plan.yearly')
    : interval === 'monthly'
      ? t('upgrade.billing.plan.monthly')
      : t('upgrade.billing.plan.pro')

  return (
    <div className="flex flex-col gap-6">
      <PitchSubscriptionCard status={status} locale={locale} t={t} />
      <section className="rounded-[var(--r-card)] p-6" style={cardSurface}>
        <p style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</p>
        <h2 className="mt-2 text-xl font-medium text-[var(--fg-1)]">
          {planLabel}
        </h2>
        <div className="mt-3 flex flex-col gap-1 text-sm text-[var(--fg-3)]">
          {status.planExpiresAt ? (
            <p>
              {t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(status.planExpiresAt, locale),
              })}
            </p>
          ) : null}
        </div>
      </section>
      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={status} t={t} />
      <div className="flex flex-col items-center gap-3">
        <PillButton
          variant="primary"
          disabled={state === 'offline'}
          onClick={() =>
            globalThis.open(playManageSubscriptionUrl(), '_blank', 'noopener,noreferrer')
          }
        >
          {t('upgrade.billing.actions.managePlay')}
        </PillButton>
        <p className="max-w-[48ch] text-center text-xs text-[var(--fg-3)]">
          {t('upgrade.billing.actions.managePlayHint')}
        </p>
      </div>
    </div>
  )
}
