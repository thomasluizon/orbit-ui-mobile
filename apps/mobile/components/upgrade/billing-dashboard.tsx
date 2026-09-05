import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
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
import { Icon } from '@/components/ui/icon'
import { ProviderHandoff } from './provider-handoff'
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

function PlanDetails({ status, data, locale, t, tokens }: Readonly<{
  state: SubscriptionScreenState
  status: SubscriptionStatus
  data: BillingDetails | null
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const summary = subscriptionSummary(status, data)
  const price = status.isLifetimePro ? null : planPrice(data, t)
  const renewal = summary.renewal ? t(summary.renewalKey, { date: formatBillingDate(summary.renewal, locale) }) : null
  return <PlanSummaryCard planLabel={t(summary.nameKey)}
    body={t(summary.bodyKey, { limit: status.aiMessagesLimit })}
    facts={[price, renewal]}
    badges={summary.badgeKey ? <Badge>{t(summary.badgeKey)}</Badge> : null}
    tokens={tokens} />
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
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('upgrade.billing.payment.title')}</Text>
      <View style={[styles.billingWell, { backgroundColor: tokens.bgWell }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="credit-card" size={20} color={tokens.fg3} />
          <Text style={[styles.billingSecondary, { color: tokens.fg1, flexShrink: 1 }]}>{t('upgrade.billing.payment.card', {
            brand: method.brand.charAt(0).toUpperCase() + method.brand.slice(1), last4: method.last4,
          })}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={[styles.billingMeta, { color: tokens.fg3 }]}>{t('upgrade.billing.payment.expires', {
            month: String(method.expMonth).padStart(2, '0'), year: method.expYear,
          })}</Text>
          <PillButton variant="ghost" size="sm" accessibleName={t('upgrade.billing.payment.change')} disabled={handoffUnavailable} onClick={onPortal}>{t('upgrade.billing.payment.change')}</PillButton>
        </View>
      </View>
    </View>
  )
}

function InvoiceRow({ invoice, locale, state, t, tokens }: Readonly<{
  invoice: BillingInvoice
  locale: string
  state: SubscriptionScreenState
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const [downloadFailed, setDownloadFailed] = useState(false)
  const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
  const title = formatPrice(invoice.amountPaid, invoice.currency)
  const description = `${formatBillingDate(invoice.date, locale)} · ${invoiceReason(invoice.billingReason, t)} · ${invoiceStatus(invoice.status, t)}`
  return (
    <View>
      {url && state !== 'offline' ? (
        <ListRow title={title} description={description} chevron={false} action={{
          icon: 'download',
          label: t('upgrade.billing.invoices.downloadDated', { date: formatBillingDate(invoice.date, locale) }),
          onPress: () => { setDownloadFailed(false); Linking.openURL(url).catch(() => setDownloadFailed(true)) },
        }} />
      ) : <ListRow title={title} description={description} readOnly />}
      {downloadFailed ? <Text accessibilityRole="alert" style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('auth.genericError')}</Text> : null}
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
    <View style={[styles.billingCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text accessibilityRole="header" style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('upgrade.billing.invoices.title')}</Text>
      <View style={{ gap: 4 }}>
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
    </View>
  )
}

export function BillingDashboard({
  state,
  data,
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
    <View style={styles.billingStack}>
      <PlanDetails state={state} status={status} data={data} locale={locale} t={t} tokens={tokens} />
      {!status.isLifetimePro ? <ProviderHandoff provider="stripe" state={state} onManage={state === 'portal-failed' ? onRetryPortal : onPortal} t={t} tokens={tokens} /> : null}
      <PaymentMethodSection method={status.isLifetimePro ? null : data?.paymentMethod} state={state} onPortal={onPortal} t={t} tokens={tokens} />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent >= 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <InvoiceHistory
        invoices={status.isLifetimePro ? undefined : data?.recentInvoices}
        locale={locale}
        state={state}
        t={t}
        tokens={tokens}
      />
      <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.actions.providerNote')}</Text>
    </View>
  )
}
