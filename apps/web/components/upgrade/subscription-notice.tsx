import { ProBenefits } from './pro-benefits'
import type { useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { Calendar, FileText, MessageCircle } from '@/components/ui/icons'
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
  const paymentFailed = status.lapseReason === 'payment_failed'
  const endedKey = paymentFailed ? 'upgrade.billing.lapsed.payment_failed' : 'upgrade.billing.lapsed.ended'
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 py-4">
        <h2 className="t-display-heading text-balance">{t('upgrade.billing.lapsed.title')}</h2>
        {endedAt ? <p className="font-mono text-xs text-[var(--fg-3)]">{t(endedKey, { date: endedAt })}</p> : null}
        {paymentFailed ? <div className="flex flex-col gap-1 text-sm text-[var(--fg-3)]">
          {!endedAt ? <p>{t('upgrade.billing.paymentIssue.title')}</p> : null}
          <p>{t('upgrade.billing.lapsed.paymentFix')}</p>
        </div> : null}
        <p className="t-body" style={{ color: 'var(--fg-2)' }}>{t('upgrade.billing.lapsed.body')}</p>
        <ul className="flex list-none flex-col gap-2 text-sm leading-[1.5] text-[var(--fg-3)]">
          {[
            { label: t('upgrade.billing.lapsed.lostMessages', { limit: status.aiMessagesLimit }), Icon: MessageCircle },
            { label: t('upgrade.billing.lapsed.lostCalendar'), Icon: Calendar },
            { label: t('upgrade.billing.lapsed.lostRetrospective'), Icon: FileText },
          ].map(({ label, Icon }) => <li key={label} className="flex items-start gap-2">
            <span aria-hidden="true" className="flex h-6 shrink-0 items-center"><Icon strokeWidth={1.5} size={16} /></span>
            <span>{label}</span>
          </li>)}
        </ul>
        {onResubscribe ? <div className="flex pt-2">
          <PillButton variant="primary" onClick={onResubscribe}>{t('upgrade.billing.lapsed.action')}</PillButton>
        </div> : null}
      </section>
      <ProBenefits heading t={t} />
    </div>
  )
}
