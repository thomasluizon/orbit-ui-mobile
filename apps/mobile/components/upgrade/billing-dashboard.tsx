import { Linking, Text, View } from 'react-native'
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
import { SectionLabel } from '@/components/ui/section-label'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { PlanSummaryCard } from './plan-summary-card'
import { PitchSubscriptionCard } from './pitch-subscription-card'
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

function planPrice(data: BillingDetails | null, t: UpgradeTextFn) {
  if (!data?.currency) return null
  const price = formatPrice(data.amountPerPeriod, data.currency)
  if (data.interval === 'yearly') {
    return t('upgrade.billing.plan.yearlyPrice', { price })
  }
  if (data.interval === 'monthly') {
    return t('upgrade.billing.plan.monthlyPrice', { price })
  }
  return null
}

function planLabel(
  interval: string | null | undefined,
  lifetime: boolean,
  t: UpgradeTextFn,
) {
  if (lifetime) return t('upgrade.billing.plan.lifetime')
  if (interval === 'yearly') return t('upgrade.billing.plan.yearly')
  if (interval === 'monthly') return t('upgrade.billing.plan.monthly')
  return t('upgrade.billing.plan.pro')
}

function PlanDetails({ state, status, data, locale, t, tokens }: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus
  data: BillingDetails | null
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const lifetime = status.isLifetimePro
  const canceled = state === 'canceled' || Boolean(data?.cancelAtPeriodEnd)
  const pastDue = state === 'past-due' || data?.status === 'past_due'
  const interval = data?.interval
  const price = planPrice(data, t)
  const renewalDate = data?.currentPeriodEnd ?? status.planExpiresAt
  const renewalKey = canceled ? 'upgrade.billing.plan.canceledHint' : 'upgrade.billing.plan.renewsOn'
  const renewal = renewalDate ? t(renewalKey, { date: formatBillingDate(renewalDate, locale) }) : null
  const label = planLabel(interval, lifetime, t)

  return (
    <PlanSummaryCard
      planLabel={label}
      meta={lifetime ? t('upgrade.billing.plan.lifetimeHint') : [price, renewal].filter(Boolean).join(' · ')}
      badges={<>
        {canceled ? <Badge>{t('upgrade.billing.plan.canceledBadge')}</Badge> : null}
        {pastDue ? <Badge>{t('upgrade.billing.plan.pastDue')}</Badge> : null}
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

function InvoiceRow({ invoice, locale, state, t, tokens }: Readonly<{
  invoice: BillingInvoice
  locale: string
  state: SubscriptionScreenState
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
  const title = formatPrice(invoice.amountPaid, invoice.currency)
  const description = `${formatBillingDate(invoice.date, locale)} · ${invoiceReason(invoice.billingReason, t)}`
  const value = invoiceStatus(invoice.status, t)
  return (
    <View style={invoice.status === 'paid' ? undefined : { backgroundColor: tokens.bgWell }}>
      {url && state !== 'offline' ? (
        <ListRow title={title} description={description} value={value} chevron={false} action={{
          icon: 'download',
          label: t('upgrade.billing.invoices.download'),
          onPress: () => { Linking.openURL(url).catch(() => {}) },
        }} />
      ) : <ListRow title={title} description={description} value={value} readOnly />}
    </View>
  )
}

function InvoiceHistory({ invoices, locale, state, t, tokens }: Readonly<{
  invoices: BillingInvoice[] | undefined
  locale: string
  state: SubscriptionScreenState
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!invoices?.length) return null
  return (
    <>
      <SectionLabel>{t('upgrade.billing.invoices.title')}</SectionLabel>
      <View style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        {invoices.map((invoice) => (
          <InvoiceRow
            key={invoice.id}
            invoice={invoice}
            locale={locale}
            state={state}
            t={t}
            tokens={tokens}
          />
        ))}
      </View>
    </>
  )
}

function PortalActions({ state, isLifetime, isOnline, onPortal, onRetryPortal, t, tokens }: Readonly<{
  state: SubscriptionScreenState
  isLifetime: boolean
  isOnline: boolean
  onPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (isLifetime) return null
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
  onPortal: () => void
  onRetryPortal: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status) return null
  return (
    <>
      <PitchSubscriptionCard status={status} locale={locale} t={t} tokens={tokens} />
      <PlanDetails state={state} status={status} data={data} locale={locale} t={t} tokens={tokens} />
      <PaymentMethodSection method={data?.paymentMethod} state={state} onPortal={onPortal} t={t} tokens={tokens} />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent >= 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <InvoiceHistory
        invoices={data?.recentInvoices}
        locale={locale}
        state={state}
        t={t}
        tokens={tokens}
      />
      <PortalActions
        state={state}
        isLifetime={status.isLifetimePro}
        isOnline={isOnline}
        onPortal={onPortal}
        onRetryPortal={onRetryPortal}
        t={t}
        tokens={tokens}
      />
    </>
  )
}
