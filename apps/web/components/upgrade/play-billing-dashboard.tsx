import { Settings } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { playManageSubscriptionUrl } from '@orbit/shared/utils'
import { UsageStats } from './usage-stats'
import {
  cardLabelStyle,
  cardSurface,
  formatBillingDate,
  metaTextStyle,
  whitePillLinkClassName,
} from './styles'

interface PlayBillingDashboardProps {
  profile: {
    subscriptionInterval?: string | null
    planExpiresAt?: string | null
    aiMessagesUsed: number
    aiMessagesLimit: number
  } | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  t: ReturnType<typeof useTranslations>
}

export function PlayBillingDashboard({ profile, locale, usagePercent, usageUrgent, t }: Readonly<PlayBillingDashboardProps>) {
  return (
    <div className="flex flex-col gap-3 stagger-enter">
      <div className="grid gap-3">
      <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
        <div style={{ padding: '16px 18px' }}>
          <div style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</div>
          <div style={{ marginTop: 3, fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--fg-1)' }}>
            {profile?.subscriptionInterval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
          </div>
          {profile?.planExpiresAt && (
            <div style={{ marginTop: 6 }}>
              <span style={metaTextStyle}>
                {t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(profile.planExpiresAt, locale) })}
              </span>
            </div>
          )}
        </div>
      </div>

      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />
      </div>

      <div className="flex flex-col items-stretch" style={{ gap: 10, paddingTop: 6 }}>
        <a
          href={playManageSubscriptionUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className={`${whitePillLinkClassName} md:max-w-[360px] md:mx-auto`}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
          {t('upgrade.billing.actions.managePlay')}
        </a>
        <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}>
          {t('upgrade.billing.actions.managePlayHint')}
        </p>
      </div>
    </div>
  )
}
