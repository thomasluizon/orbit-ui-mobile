import {
  AlertTriangle, CreditCard, Download, Receipt, Settings,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { useBilling } from '@/hooks/use-billing'
import { UsageStats } from './usage-stats'
import {
  cardLabelStyle,
  cardSurface,
  formatBillingDate,
  formatCardBrand,
  invoiceStatusColor,
  metaTextStyle,
} from './styles'

function invoiceReasonLabelFn(reason: string, t: ReturnType<typeof useTranslations>): string {
  const reasons: Record<string, string> = {
    subscription_create: t('upgrade.billing.invoices.reasonCreate'),
    subscription_cycle: t('upgrade.billing.invoices.reasonCycle'),
    subscription_update: t('upgrade.billing.invoices.reasonUpdate'),
    manual: t('upgrade.billing.invoices.reasonManual'),
  }
  return reasons[reason] ?? reason
}

function invoiceStatusLabelFn(status: string, t: ReturnType<typeof useTranslations>): string {
  const statuses: Record<string, string> = {
    paid: t('upgrade.billing.invoices.statusPaid'),
    open: t('upgrade.billing.invoices.statusOpen'),
    void: t('upgrade.billing.invoices.statusVoid'),
  }
  return statuses[status] ?? status
}

interface BillingDashboardProps {
  billing: ReturnType<typeof useBilling>['billing']
  isBillingLoading: boolean
  isBillingError: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number; isLifetimePro?: boolean } | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  portalError: string
  onOpenPortal: () => void
  onRetryBilling: () => void
  t: ReturnType<typeof useTranslations>
}

export function BillingDashboard({
  billing, isBillingLoading, isBillingError, profile, locale,
  usagePercent, usageUrgent, portalError, onOpenPortal, onRetryBilling, t,
}: Readonly<BillingDashboardProps>) {
  return (
    <div className="space-y-3 stagger-enter">
      {isBillingLoading && (
        <>
          <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
            <div className="skeleton-pulse h-3.5 w-20 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="skeleton-pulse mt-2.5 h-4 w-36 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="skeleton-pulse mt-2 h-3 w-44 rounded" style={{ background: 'var(--bg-elev-2)' }} />
          </div>
          <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
            <div className="skeleton-pulse h-3.5 w-20 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="mt-3 flex items-center justify-between">
              <div className="skeleton-pulse h-3.5 w-24 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="skeleton-pulse h-3.5 w-16 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            </div>
            <div className="skeleton-pulse mt-3 h-2 w-full rounded-full" style={{ background: 'var(--bg-elev-2)' }} />
          </div>
        </>
      )}

      {isBillingError && !billing && !isBillingLoading && (
        <div className="rounded-[18px] text-center" style={{ padding: '28px 18px', ...cardSurface }}>
          <AlertTriangle size={26} strokeWidth={1.8} className="mx-auto text-[var(--fg-3)]" />
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('upgrade.billing.error')}
          </p>
          <button
            type="button"
            className="chip touch-target"
            style={{ marginTop: 10 }}
            onClick={onRetryBilling}
          >
            {t('upgrade.billing.retry')}
          </button>
        </div>
      )}

      {billing && (
        <div className="grid gap-3">
          <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--hairline)' }}>
              <div style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</div>
              <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 3 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--fg-1)' }}>
                  {billing.interval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
                </span>
                {billing.cancelAtPeriodEnd && (
                  <Badge tone="amber">{t('upgrade.billing.plan.canceledBadge')}</Badge>
                )}
                {!billing.cancelAtPeriodEnd && billing.status === 'past_due' && (
                  <Badge tone="bad">{t('upgrade.billing.plan.pastDue')}</Badge>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <span style={metaTextStyle}>
                {billing.cancelAtPeriodEnd
                  ? t('upgrade.billing.plan.canceledHint', { date: formatBillingDate(billing.currentPeriodEnd, locale) })
                  : t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(billing.currentPeriodEnd, locale) })}
                {billing.amountPerPeriod > 0 && (
                  <>
                    {' · '}
                    {formatPrice(billing.amountPerPeriod, billing.currency)}
                    {billing.interval === 'yearly' ? t('upgrade.plans.yearly.period') : t('upgrade.plans.monthly.period')}
                  </>
                )}
              </span>
            </div>
          </div>

          {billing.paymentMethod && (
            <div className="flex items-center rounded-[18px]" style={{ padding: '16px 18px', gap: 14, ...cardSurface }}>
              <CreditCard size={24} strokeWidth={1.8} className="shrink-0 text-[var(--fg-3)]" />
              <div className="min-w-0 flex-1">
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
                  {t('upgrade.billing.payment.card', {
                    brand: formatCardBrand(billing.paymentMethod.brand),
                    last4: billing.paymentMethod.last4,
                  })}
                </p>
                <p style={{ margin: '2px 0 0', ...metaTextStyle, fontSize: 12.5 }}>
                  {t('upgrade.billing.payment.expires', {
                    month: String(billing.paymentMethod.expMonth).padStart(2, '0'),
                    year: billing.paymentMethod.expYear,
                  })}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                }}
                onClick={onOpenPortal}
              >
                {t('upgrade.billing.payment.change')}
              </button>
            </div>
          )}

          <div className="flex flex-col items-stretch" style={{ gap: 10, paddingTop: 6 }}>
            <PillButton
              variant="secondary"
              fullWidth
              onClick={onOpenPortal}
              leading={<Settings size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {t('upgrade.billing.actions.manage')}
            </PillButton>
            <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}>
              {t('upgrade.billing.actions.manageHint')}
            </p>
            {portalError && (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-bad)' }}>
                {portalError}
              </p>
            )}
          </div>
          </div>

          <div className="flex flex-col gap-3">
          <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />

          {billing.recentInvoices.length > 0 && (
            <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
              <div style={{ padding: '14px 18px 2px', ...cardLabelStyle }}>
                {t('upgrade.billing.invoices.title')}
              </div>
              {billing.recentInvoices.map((invoice, index) => (
                <div
                  key={invoice.id}
                  className="flex items-center"
                  style={{
                    padding: '14px 18px',
                    gap: 14,
                    borderTop: index > 0 ? '1px solid var(--hairline)' : undefined,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex shrink-0 justify-center"
                    style={{ width: 26 }}
                  >
                    <Receipt size={22} strokeWidth={1.8} color="var(--fg-1)" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--fg-1)' }}>
                      {formatPrice(invoice.amountPaid, invoice.currency)}
                    </div>
                    <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                        {formatBillingDate(invoice.date, locale)} · {invoiceReasonLabelFn(invoice.billingReason, t)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      letterSpacing: '0.04em',
                      color: invoiceStatusColor(invoice.status),
                    }}
                  >
                    {invoiceStatusLabelFn(invoice.status, t)}
                  </span>
                  {(invoice.invoicePdf ?? invoice.hostedInvoiceUrl) && (
                    <a
                      href={invoice.invoicePdf ?? invoice.hostedInvoiceUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-btn touch-target shrink-0"
                      style={{ width: 40, height: 40, color: 'var(--fg-3)' }}
                      title={t('upgrade.billing.invoices.download')}
                      aria-label={t('upgrade.billing.invoices.download')}
                    >
                      <Download size={20} strokeWidth={1.8} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          </div>
        </div>
      )}

      {!isBillingLoading && !isBillingError && !billing && (
        <>
          <div className="flex flex-col items-center text-center" style={{ padding: '26px 20px 10px', gap: 10 }}>
            <VerifiedBadge size={84} />
            <h2
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                color: 'var(--fg-1)',
              }}
            >
              {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetime') : t('upgrade.alreadyPro')}
            </h2>
            <p style={{ margin: 0, maxWidth: 320, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-3)' }}>
              {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetimeHint') : t('upgrade.manageHint')}
            </p>
          </div>

          <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />
        </>
      )}
    </div>
  )
}
