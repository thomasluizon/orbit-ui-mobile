import {
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  CreditCard,
  Download,
  Receipt,
  Settings,
} from 'lucide-react-native'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { Badge } from '@/components/ui/badge'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { SkeletonLine } from '@/components/ui/skeleton'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { PlanSummaryCard } from './plan-summary-card'
import { ProActivePanel } from './pro-active-panel'
import { UsageCard } from './usage-card'
import { styles } from './styles'
import { formatBillingDate, invoiceStatusColor } from './types'
import type { Tokens, UpgradeTextFn } from './types'

function Invoices({
  data,
  locale,
  t,
  tokens,
}: Readonly<{
  data: BillingDetails
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (data.recentInvoices.length === 0) return null
  return (
    <>
      <SectionLabel>{t('upgrade.billing.invoices.title')}</SectionLabel>
      {data.recentInvoices.map((invoice) => {
        const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
        const statusLabel =
          (
            {
              paid: t('upgrade.billing.invoices.statusPaid'),
              open: t('upgrade.billing.invoices.statusOpen'),
              void: t('upgrade.billing.invoices.statusVoid'),
            } as Record<string, string>
          )[invoice.status] ?? invoice.status
        return (
          <View
            key={invoice.id}
            style={[styles.invoiceRow, { borderBottomColor: tokens.hairline }]}
          >
            <View style={styles.invoiceIconSlot}>
              <Receipt size={22} strokeWidth={1.8} color={tokens.fg1} />
            </View>
            <View style={styles.invoiceMeta}>
              <Text style={[styles.invoiceAmount, { color: tokens.fg1 }]}>
                {formatPrice(invoice.amountPaid, invoice.currency)}
              </Text>
              <Text style={[styles.invoiceDate, { color: tokens.fg3 }]}>
                {formatBillingDate(invoice.date, locale)}
              </Text>
            </View>
            <Text
              style={[
                styles.invoiceStatus,
                { color: invoiceStatusColor(invoice.status, tokens) },
              ]}
            >
              {statusLabel}
            </Text>
            {url ? (
              <Pressable
                onPress={() => {
                  Linking.openURL(url).catch(() => {})
                }}
                style={({ pressed }) => [
                  styles.iconWell,
                  { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
                  pressed ? styles.pressedScale : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('upgrade.billing.invoices.download')}
              >
                <Download size={20} strokeWidth={1.8} color={tokens.fg3} />
              </Pressable>
            ) : null}
          </View>
        )
      })}
    </>
  )
}

export function BillingDashboard({
  data,
  isBillingLoading,
  isBillingError,
  isOnline,
  locale,
  usagePercent,
  usageProfile,
  profile,
  portalLoading,
  portalError,
  onPortal,
  onRetryBilling,
  t,
  tokens,
}: Readonly<{
  data: BillingDetails | null
  isBillingLoading: boolean
  isBillingError: boolean
  isOnline: boolean
  locale: string
  usagePercent: number
  usageProfile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  profile: { isLifetimePro?: boolean } | null
  portalLoading: boolean
  portalError: string
  onPortal: () => void
  onRetryBilling: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (isBillingLoading) {
    return (
      <>
        <View style={[styles.card, { borderColor: tokens.hairline, backgroundColor: tokens.bgCard }]}>
          <SkeletonLine width={80} height={14} />
          <SkeletonLine width={140} height={18} style={{ marginTop: 10 }} />
          <SkeletonLine width={180} height={12} style={{ marginTop: 8 }} />
        </View>
        <View style={[styles.card, { borderColor: tokens.hairline, backgroundColor: tokens.bgCard }]}>
          <SkeletonLine width={80} height={14} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <SkeletonLine width={100} height={14} />
            <SkeletonLine width={60} height={14} />
          </View>
          <SkeletonLine width="100%" height={8} style={{ marginTop: 12, borderRadius: 999 }} />
        </View>
      </>
    )
  }
  if (isBillingError && !data) {
    if (!isOnline) {
      return (
        <View style={styles.padBlock}>
          <OfflineUnavailableState
            title={t('offline.title')}
            description={t('offline.description')}
            compact
          />
        </View>
      )
    }
    return (
      <View style={styles.padBlock}>
        <AlertTriangle size={26} strokeWidth={1.8} color={tokens.fg3} />
        <Text style={[styles.noticeText, { color: tokens.fg2 }]}>
          {t('upgrade.billing.error')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetryBilling}
          hitSlop={{ top: 6, bottom: 6 }}
          style={({ pressed }) => [
            styles.actionChip,
            {
              backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
              borderColor: tokens.hairline,
            },
            pressed ? styles.pressedScale : null,
          ]}
        >
          <Text style={[styles.link, { color: tokens.fg1 }]}>
            {t('upgrade.billing.retry')}
          </Text>
        </Pressable>
      </View>
    )
  }
  if (!data) {
    return (
      <ProActivePanel
        profile={profile}
        usagePercent={usagePercent}
        usageProfile={usageProfile}
        t={t}
        tokens={tokens}
      />
    )
  }
  return (
    <>
      <PlanSummaryCard
        planLabel={
          data.interval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : t('upgrade.billing.plan.monthly')
        }
        meta={
          data.cancelAtPeriodEnd
            ? t('upgrade.billing.plan.canceledHint', {
                date: formatBillingDate(data.currentPeriodEnd, locale),
              })
            : t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(data.currentPeriodEnd, locale),
              })
        }
        badges={
          <>
            {data.cancelAtPeriodEnd ? (
              <Badge tone="amber">{t('upgrade.billing.plan.canceledBadge')}</Badge>
            ) : null}
            {data.status === 'past_due' && !data.cancelAtPeriodEnd ? (
              <Badge tone="bad">{t('upgrade.billing.plan.pastDue')}</Badge>
            ) : null}
          </>
        }
        t={t}
        tokens={tokens}
      />

      {data.paymentMethod ? (
        <>
          <SectionLabel>{t('upgrade.billing.payment.title')}</SectionLabel>
          <SettingsRow
            icon={CreditCard}
            label={t('upgrade.billing.payment.card', {
              brand:
                data.paymentMethod.brand.charAt(0).toUpperCase() +
                data.paymentMethod.brand.slice(1),
              last4: data.paymentMethod.last4,
            })}
            value={t('upgrade.billing.payment.expires', {
              month: String(data.paymentMethod.expMonth).padStart(2, '0'),
              year: data.paymentMethod.expYear,
            })}
            mono
            accessory="none"
          />
          <SettingsRow
            label={t('upgrade.billing.payment.change')}
            onPress={onPortal}
            accessory="chevron"
          />
        </>
      ) : null}

      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent > 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />

      <Invoices data={data} locale={locale} t={t} tokens={tokens} />

      <View style={styles.actionPad}>
        <PillButton
          variant="white"
          fullWidth
          onPress={onPortal}
          disabled={portalLoading || !isOnline}
          leading={<Settings size={18} strokeWidth={1.8} color={tokens.bg} />}
        >
          {t('upgrade.billing.actions.manage')}
        </PillButton>
        <Text style={[styles.centerMuted, { color: tokens.fg3 }]}>
          {t('upgrade.billing.actions.manageHint')}
        </Text>
        {portalError ? (
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {portalError}
          </Text>
        ) : null}
      </View>
    </>
  )
}
