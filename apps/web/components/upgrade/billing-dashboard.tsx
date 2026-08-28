import type { useTranslations } from 'next-intl'
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
import { cardLabelStyle, cardSurface, formatBillingDate } from './styles'

type UpgradeTranslations = ReturnType<typeof useTranslations>

function billedPrice(billing: BillingDetails, t: UpgradeTranslations) {
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

function planLabel(interval: string | null | undefined, t: UpgradeTranslations) {
  return interval === 'yearly'
    ? t('upgrade.billing.plan.yearly')
    : interval === 'monthly'
      ? t('upgrade.billing.plan.monthly')
      : t('upgrade.billing.plan.pro')
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

function PlanSummary({ state, status, billing, locale, t }: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus
  billing: BillingDetails | null
  locale: string
  t: UpgradeTranslations
}>) {
  const lifetime = status.isLifetimePro
  const canceled = state === 'canceled' || Boolean(billing?.cancelAtPeriodEnd)
  const pastDue = state === 'past-due' || billing?.status === 'past_due'
  const renewalDate = billing?.currentPeriodEnd ?? status.planExpiresAt
  const price = billing ? billedPrice(billing, t) : null
  const renewalKey = canceled
    ? 'upgrade.billing.plan.canceledHint'
    : 'upgrade.billing.plan.renewsOn'

  return (
    <section className="rounded-[var(--r-card)] p-6" style={cardSurface}>
      <p style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-xl font-medium text-[var(--fg-1)]">
          {lifetime ? t('upgrade.billing.plan.lifetime') : planLabel(billing?.interval, t)}
        </h2>
        {canceled ? <Badge>{t('upgrade.billing.plan.canceledBadge')}</Badge> : null}
        {pastDue ? <Badge>{t('upgrade.billing.plan.pastDue')}</Badge> : null}
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm text-[var(--fg-3)]">
        {lifetime ? <p>{t('upgrade.billing.plan.lifetimeHint')}</p> : null}
        {!lifetime && price ? <p>{price}</p> : null}
        {!lifetime && renewalDate ? <p>{t(renewalKey, { date: formatBillingDate(renewalDate, locale) })}</p> : null}
      </div>
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
    <section className="overflow-hidden rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)]">
      <ListRow
        icon="credit-card"
        title={t('upgrade.billing.payment.card', {
          brand: method.brand.charAt(0).toUpperCase() + method.brand.slice(1),
          last4: method.last4,
        })}
        value={t('upgrade.billing.payment.expires', {
          month: String(method.expMonth).padStart(2, '0'),
          year: method.expYear,
        })}
        chevron={false}
        action={handoffUnavailable ? undefined : {
          icon: 'external-link',
          label: t('upgrade.billing.payment.change'),
          onPress: onOpenPortal,
        }}
      />
    </section>
  )
}

function InvoiceRow({ invoice, locale, t }: Readonly<{
  invoice: BillingInvoice
  locale: string
  t: UpgradeTranslations
}>) {
  const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
  const title = `${formatPrice(invoice.amountPaid, invoice.currency)} · ${invoiceStatus(invoice.status, t)}`
  const description = `${formatBillingDate(invoice.date, locale)} · ${invoiceReason(invoice.billingReason, t)}`
  return (
    <div className={invoice.status === 'paid' ? '' : 'bg-[var(--bg-well)]'}>
      {url ? (
        <ListRow title={title} description={description} chevron={false} action={{
          icon: 'download',
          label: t('upgrade.billing.invoices.download'),
          onPress: () => globalThis.open(url, '_blank', 'noopener,noreferrer'),
        }} />
      ) : <ListRow title={title} description={description} readOnly />}
    </div>
  )
}

function InvoiceHistory({ invoices, locale, t }: Readonly<{
  invoices: BillingInvoice[] | undefined
  locale: string
  t: UpgradeTranslations
}>) {
  if (!invoices?.length) return null
  return (
    <section>
      <p className="t-eyebrow mb-2 text-[var(--fg-3)]">{t('upgrade.billing.invoices.title')}</p>
      <div className="overflow-hidden rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)]">
        {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} locale={locale} t={t} />)}
      </div>
    </section>
  )
}

function PortalActions({ state, isLifetime, onOpenPortal, onRetryPortal, t }: Readonly<{
  state: SubscriptionScreenState
  isLifetime: boolean
  onOpenPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTranslations
}>) {
  if (isLifetime) return null
  const failed = state === 'portal-failed'
  return (
    <div className="flex flex-col items-center gap-3">
      {failed ? (
        <>
          <p className="text-center text-sm text-[var(--fg-2)]" role="alert">{t('upgrade.billing.portalFailed')}</p>
          <PillButton variant="ghost" onClick={onRetryPortal}>{t('upgrade.billing.retry')}</PillButton>
        </>
      ) : (
        <PillButton variant="primary" loading={state === 'portal-opening'} disabled={state === 'offline'} onClick={onOpenPortal}>
          {state === 'portal-opening' ? t('upgrade.billing.actions.opening') : t('upgrade.billing.actions.manage')}
        </PillButton>
      )}
      <p className="text-center text-xs text-[var(--fg-3)]">{t('upgrade.billing.actions.manageHint')}</p>
      <p className="max-w-[48ch] text-center text-xs leading-5 text-[var(--fg-3)]">{t('upgrade.billing.actions.providerNote')}</p>
    </div>
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
      <PaymentMethodSection method={billing?.paymentMethod} state={state} onOpenPortal={onOpenPortal} t={t} />
      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={status} t={t} />
      <InvoiceHistory invoices={billing?.recentInvoices} locale={locale} t={t} />
      <PortalActions
        state={state}
        isLifetime={status.isLifetimePro}
        onOpenPortal={onOpenPortal}
        onRetryPortal={onRetryPortal}
        t={t}
      />
    </div>
  )
}
