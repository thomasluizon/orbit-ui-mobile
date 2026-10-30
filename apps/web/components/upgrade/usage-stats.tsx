import { createAstraAllowanceTranslator, type AstraAllowance } from '@orbit/shared/utils'
import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { useTranslations } from 'next-intl'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'

export function UsageStats({ usagePercent, profile, t, locale = 'en' }: Readonly<{
  locale?: string
  usagePercent: number
  profile: ({ aiMessagesUsed: number; aiMessagesLimit: number } & AstraAllowance) | null
  t: ReturnType<typeof useTranslations>
}>) {
  const translate = createAstraAllowanceTranslator(t, profile, locale)
  const remaining = profile ? profile.aiMessagesLimit - profile.aiMessagesUsed : null
  const nearLimit = remaining !== null && remaining <= AI_MESSAGE_COUNTER_THRESHOLD
  return (
    <div className="flex flex-col gap-3">
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[var(--fg-2)]">{t('upgrade.billing.usage.title')}</h2>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-1)' }}>
          {translate('upgrade.billing.usage.aiMessages')}
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
        label={translate('upgrade.billing.usage.aiMessages')}

      />
    </section>
    {profile?.aiMessagesPeriod === 'week' && !nearLimit ? <p className="text-sm text-[var(--fg-3)]">{translate('shell.composer.limit.renewal')}</p> : null}
    {nearLimit ? (
      <CapacityNotice
        message={translate(remaining <= 0 ? 'shell.composer.limit.exhausted' : 'upgrade.billing.usage.nearLimit')}
        body={translate('shell.composer.limit.renewal')}
      />
    ) : null}
    </div>
  )
}
