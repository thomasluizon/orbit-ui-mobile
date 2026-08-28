import { Linking, Text, View } from 'react-native'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type {
  BillingDetails,
  BillingInvoice,
  BillingPaymentMethod,
  SubscriptionPlans,
} from '@orbit/shared/types/subscription'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { PlanSummaryCard } from './plan-summary-card'
import { UsageCard } from './usage-card'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

function invoiceStatus(status: string, t: UpgradeTextFn) {
  const labels: Record<string, string> = {
    paid: t('upgrade.billing.invoices.statusPaid'),
    open: t('upgrade.billing.invoices.statusOpen'),
    void: t('upgrade.billing.invoices.statusVoid'),
  }
  return labels[status] ?? status
}

function invoiceReason(reason: string, t: UpgradeTextFn) {
  const labels: Record<string, string> = {
    subscription_create: t('upgrade.billing.invoices.reasonCreate'),
    subscription_cycle: t('upgrade.billing.invoices.reasonCycle'),
    subscription_update: t('upgrade.billing.invoices.reasonUpdate'),
    manual: t('upgrade.billing.invoices.reasonManual'),
  }
  return labels[reason] ?? reason
}

function PlanDetails({ state, status, data, plans, locale, t, tokens }: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus
  data: BillingDetails | null
  plans: SubscriptionPlans | null | undefined
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const lifetime = state === 'lifetime'
  const interval = status.subscriptionInterval ?? 'monthly'
  const plan = plans?.[interval]
  const amount = plan?.unitAmount
  const currency = plan?.currency
  const amountLabel = amount != null && currency ? formatPrice(amount, currency) : null
  const price = amountLabel
    ? t(interval === 'yearly' ? 'upgrade.billing.plan.yearlyPrice' : 'upgrade.billing.plan.monthlyPrice', { price: amountLabel })
    : null
  const renewalDate = data?.currentPeriodEnd ?? status.planExpiresAt
  const renewalKey = state === 'canceled' ? 'upgrade.billing.plan.canceledHint' : 'upgrade.billing.plan.renewsOn'
  const renewal = renewalDate ? t(renewalKey, { date: formatBillingDate(renewalDate, locale) }) : null
  const planLabel = lifetime
    ? t('upgrade.billing.plan.lifetime')
    : t(interval === 'yearly' ? 'upgrade.billing.plan.yearly' : 'upgrade.billing.plan.monthly')

  return (
    <PlanSummaryCard
      planLabel={planLabel}
      meta={lifetime ? t('upgrade.billing.plan.lifetimeHint') : [price, renewal].filter(Boolean).join(' · ')}
      badges={<>
        {state === 'canceled' ? <Badge>{t('upgrade.billing.plan.canceledBadge')}</Badge> : null}
        {state === 'past-due' ? <Badge>{t('upgrade.billing.plan.pastDue')}</Badge> : null}
      </>}
      t={t}
      tokens={tokens}
    />
  )
}

function PaymentMethodSection({ method, state, onPortal, t, tokens }: Readonly<{
  method: BillingPaymentMethod | null | undefined
  state: SubscriptionScreenState
  onPortal: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!method) return null
  const handoffUnavailable = ['portal-failed', 'portal-opening', 'offline'].includes(state)
  return (
    <>
      <SectionLabel>{t('upgrade.billing.payment.title')}</SectionLabel>
      <View style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
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
            onPress: onPortal,
          }}
        />
      </View>
    </>
  )
}

function InvoiceRow({ invoice, locale, t, tokens }: Readonly<{
  invoice: BillingInvoice
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
  const title = formatPrice(invoice.amountPaid, invoice.currency)
  const description = `${formatBillingDate(invoice.date, locale)} · ${invoiceReason(invoice.billingReason, t)}`
  const value = invoiceStatus(invoice.status, t)
  return (
    <View style={invoice.status === 'paid' ? undefined : { backgroundColor: tokens.bgWell }}>
      {url ? (
        <ListRow title={title} description={description} value={value} chevron={false} action={{
          icon: 'download',
          label: t('upgrade.billing.invoices.download'),
          onPress: () => { Linking.openURL(url).catch(() => {}) },
        }} />
      ) : <ListRow title={title} description={description} value={value} readOnly />}
    </View>
  )
}

function InvoiceHistory({ invoices, locale, t, tokens }: Readonly<{
  invoices: BillingInvoice[] | undefined
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!invoices?.length) return null
  return (
    <>
      <SectionLabel>{t('upgrade.billing.invoices.title')}</SectionLabel>
      <View style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} locale={locale} t={t} tokens={tokens} />)}
      </View>
    </>
  )
}

function PortalActions({ state, isOnline, onPortal, onRetryPortal, t, tokens }: Readonly<{
  state: SubscriptionScreenState
  isOnline: boolean
  onPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (state === 'lifetime') return null
  const failed = state === 'portal-failed'
  return (
    <View style={styles.actionPad}>
      {failed ? (
        <>
          <Text accessibilityRole="alert" style={[styles.centerMuted, { color: tokens.fg2 }]}>{t('upgrade.billing.portalFailed')}</Text>
          <PillButton variant="ghost" onClick={onRetryPortal}>{t('upgrade.billing.retry')}</PillButton>
        </>
      ) : (
        <PillButton variant="primary" loading={state === 'portal-opening'} disabled={!isOnline} onClick={onPortal}>
          {state === 'portal-opening' ? t('upgrade.billing.actions.opening') : t('upgrade.billing.actions.manage')}
        </PillButton>
      )}
      <Text style={[styles.centerMuted, { color: tokens.fg3 }]}>{t('upgrade.billing.actions.manageHint')}</Text>
      <Text style={[styles.centerMuted, { color: tokens.fg3 }]}>{t('upgrade.billing.actions.providerNote')}</Text>
    </View>
  )
}

export function BillingDashboard({
  state,
  data,
  isOnline,
  locale,
  usagePercent,
  usageProfile,
  status,
  plans,
  onPortal,
  onRetryPortal,
  t,
  tokens,
}: Readonly<{
  state: SubscriptionScreenState
  data: BillingDetails | null
  isOnline: boolean
  locale: string
  usagePercent: number
  usageProfile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  status: SubscriptionStatus | null
  plans: SubscriptionPlans | null | undefined
  onPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status) return null
  return (
    <>
      <PlanDetails state={state} status={status} data={data} plans={plans} locale={locale} t={t} tokens={tokens} />
      <PaymentMethodSection method={data?.paymentMethod} state={state} onPortal={onPortal} t={t} tokens={tokens} />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent >= 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <InvoiceHistory invoices={data?.recentInvoices} locale={locale} t={t} tokens={tokens} />
      <PortalActions state={state} isOnline={isOnline} onPortal={onPortal} onRetryPortal={onRetryPortal} t={t} tokens={tokens} />
    </>
  )
}
