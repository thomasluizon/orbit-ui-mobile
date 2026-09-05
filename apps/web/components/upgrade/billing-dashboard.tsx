import type { useTranslations } from 'next-intl'
import { subscriptionSummary } from '@orbit/shared/utils'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type {
  BillingDetails,
  BillingInvoice,
  BillingPaymentMethod,
} from '@orbit/shared/types/subscription'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { UsageStats } from './usage-stats'
import { ProviderHandoff } from './provider-handoff'
import { Icon } from '@/components/ui/icon'
import { cardSurface, formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

function planPrice(billing: BillingDetails, t: UpgradeTranslations) {
  if (!billing.currency) return null
  const price = formatPrice(billing.amountPerPeriod, billing.currency)
  if (billing.interval === 'yearly') {
    return t('upgrade.billing.plan.yearlyPrice', { price })
  }
  if (billing.interval === 'monthly') {
    return t('upgrade.billing.plan.monthlyPrice', { price })
  }
  return null
}

function invoiceReason(reason: string, t: UpgradeTranslations): string {
  const labels: Record<string, string> = {
    subscription_create: t('upgrade.billing.invoices.reasonCreate'),
    subscription_cycle: t('upgrade.billing.invoices.reasonCycle'),
    subscription_update: t('upgrade.billing.invoices.reasonUpdate'),
    manual: t('upgrade.billing.invoices.reasonManual'),
  }
  return labels[reason] ?? reason
}

function invoiceStatus(status: string, t: UpgradeTranslations): string {
  const labels: Record<string, string> = {
    paid: t('upgrade.billing.invoices.statusPaid'),
    open: t('upgrade.billing.invoices.statusOpen'),
    void: t('upgrade.billing.invoices.statusVoid'),
  }
  return labels[status] ?? status
}

function PlanSummary({ status, billing, locale, t }: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus
  billing: BillingDetails | null
  locale: string
  t: UpgradeTranslations
}>) {
  const summary = subscriptionSummary(status, billing)
  const price = !status.isLifetimePro && billing ? planPrice(billing, t) : null
  return (
    <section className="flex flex-col gap-3 rounded-[var(--r-card)] p-6" style={cardSurface}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-max flex-1 font-display text-[22px] font-medium leading-[1.4] tracking-[-0.02em] text-[var(--fg-1)]">{t(summary.nameKey)}</h1>
        {summary.badgeKey ? <Badge>{t(summary.badgeKey)}</Badge> : null}
      </div>
      <p className="t-body text-pretty text-[var(--fg-2)]">{t(summary.bodyKey, { limit: status.aiMessagesLimit })}</p>
      {price || summary.renewal ? <div className="flex flex-col gap-1 font-mono text-xs leading-[1.4] text-[var(--fg-2)]">
        {price ? <p>{price}</p> : null}
        {summary.renewal ? <p>{t(summary.renewalKey, { date: formatBillingDate(summary.renewal, locale) })}</p> : null}
      </div> : null}
    </section>
  )
}

function PaymentMethodSection({ method, state, onOpenPortal, t }: Readonly<{
  method: BillingPaymentMethod | null | undefined
  state: SubscriptionScreenState
  onOpenPortal: () => void
  t: UpgradeTranslations
}>) {
  if (!method) return null
  const handoffUnavailable = ['portal-failed', 'portal-opening', 'offline'].includes(state)
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[var(--fg-2)]">{t('upgrade.billing.payment.title')}</h2>
      <div className="flex flex-col gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="shrink-0 text-[var(--fg-3)]"><Icon name="credit-card" size={20} /></span>
          <p className="min-w-0 text-sm text-[var(--fg-1)]">{t('upgrade.billing.payment.card', {
            brand: method.brand.charAt(0).toUpperCase() + method.brand.slice(1), last4: method.last4,
          })}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-[var(--fg-3)]">{t('upgrade.billing.payment.expires', {
            month: String(method.expMonth).padStart(2, '0'), year: method.expYear,
          })}</p>
          <PillButton variant="ghost" size="sm" disabled={handoffUnavailable} onClick={onOpenPortal}>
            {t('upgrade.billing.payment.change')}
          </PillButton>
        </div>
      </div>
    </section>
  )
}

function InvoiceRow({ invoice, locale, state, t }: Readonly<{
  invoice: BillingInvoice
  locale: string
  state: SubscriptionScreenState
  t: UpgradeTranslations
}>) {
  const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
  const title = formatPrice(invoice.amountPaid, invoice.currency)
  const description = `${formatBillingDate(invoice.date, locale)} · ${invoiceReason(invoice.billingReason, t)} · ${invoiceStatus(invoice.status, t)}`
  return (
    <div>
      {url && state !== 'offline' ? (
        <ListRow title={title} description={description} chevron={false} action={{
          icon: 'download',
          label: t('upgrade.billing.invoices.downloadDated', { date: formatBillingDate(invoice.date, locale) }),
          onPress: () => globalThis.open(url, '_blank', 'noopener,noreferrer'),
        }} />
      ) : <ListRow title={title} description={description} readOnly />}
    </div>
  )
}

function InvoiceHistory({ invoices, locale, state, t }: Readonly<{
  invoices: BillingInvoice[] | undefined
  locale: string
  state: SubscriptionScreenState
  t: UpgradeTranslations
}>) {
  if (!invoices?.length) return null
  return (
    <section className="flex flex-col gap-2 rounded-[var(--r-card)] p-6" style={cardSurface}>
      <h2 className="text-sm font-medium text-[var(--fg-2)]">{t('upgrade.billing.invoices.title')}</h2>
      <div className="flex flex-col gap-1">
        {invoices.map((invoice) => (
          <InvoiceRow key={invoice.id} invoice={invoice} locale={locale} state={state} t={t} />
        ))}
      </div>
    </section>
  )
}

export function BillingDashboard({
  state,
  billing,
  status,
  locale,
  usagePercent,
  usageUrgent,
  onOpenPortal,
  onRetryPortal,
  t,
}: Readonly<{
  state: SubscriptionScreenState
  billing: BillingDetails | null
  status: SubscriptionStatus | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  onOpenPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTranslations
}>) {
  if (!status) return null
  return (
    <div className="flex flex-col gap-6">
      <PlanSummary state={state} status={status} billing={billing} locale={locale} t={t} />
      {!status.isLifetimePro ? <ProviderHandoff provider="stripe" state={state} onManage={state === 'portal-failed' ? onRetryPortal : onOpenPortal} t={t} /> : null}
      <PaymentMethodSection method={status.isLifetimePro ? null : billing?.paymentMethod} state={state} onOpenPortal={onOpenPortal} t={t} />
      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={status} t={t} />
      <InvoiceHistory invoices={status.isLifetimePro ? undefined : billing?.recentInvoices} locale={locale} state={state} t={t} />
      <p className="t-secondary text-pretty text-[var(--fg-3)]">{t('upgrade.billing.actions.providerNote')}</p>
    </div>
  )
}
