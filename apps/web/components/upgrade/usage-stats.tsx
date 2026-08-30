import { useTranslations } from 'next-intl'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { cardLabelStyle, cardSurface, metaTextStyle } from './styles'

export function UsageStats({ usagePercent, usageUrgent, profile, t }: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <div className="flex flex-col gap-3">
    <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
      <div style={cardLabelStyle}>{t('upgrade.billing.usage.title')}</div>
      <div className="flex items-baseline justify-between" style={{ marginTop: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
          {t('upgrade.billing.usage.aiMessages')}
        </span>
        <span
          style={{
            ...metaTextStyle,
            color: usageUrgent ? 'var(--status-overdue-text)' : 'var(--fg-2)',
          }}
        >
          {t('upgrade.billing.usage.aiMessagesOf', {
            used: profile?.aiMessagesUsed ?? 0,
            limit: profile?.aiMessagesLimit ?? 0,
          })}
        </span>
      </div>
      <ProgressBar
        value={usagePercent / 100} max={1}
        label={t('upgrade.billing.usage.aiMessages')}

      />
    </div>
    {usageUrgent ? (
      <CapacityNotice
        message={t('upgrade.billing.usage.nearLimit')}
        body={t('upgrade.billing.usage.nearLimitBody')}
      />
    ) : null}
    </div>
  )
}
