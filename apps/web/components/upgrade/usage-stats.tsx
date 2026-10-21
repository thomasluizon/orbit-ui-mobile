import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { useTranslations } from 'next-intl'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'

export function UsageStats({ usagePercent, profile, t }: Readonly<{
  usagePercent: number
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: ReturnType<typeof useTranslations>
}>) {
  const remaining = profile ? profile.aiMessagesLimit - profile.aiMessagesUsed : null
  const nearLimit = remaining !== null && remaining <= AI_MESSAGE_COUNTER_THRESHOLD
  return (
    <div className="flex flex-col gap-3">
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[var(--fg-2)]">{t('upgrade.billing.usage.title')}</h2>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-1)' }}>
          {t('upgrade.billing.usage.aiMessages')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums',
            color: 'var(--fg-3)',
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
    </section>
    {nearLimit ? (
      <CapacityNotice
        message={t(remaining <= 0 ? 'shell.composer.limit.exhausted' : 'upgrade.billing.usage.nearLimit')}
        body={t('shell.composer.limit.renewal')}
      />
    ) : null}
    </div>
  )
}
