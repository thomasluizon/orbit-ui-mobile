import { useMemo, useState, type ComponentType } from 'react'
import { ActivityIndicator, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, Check, CheckCircle2, Clock, CreditCard, Download, Flame, Megaphone, MessageSquare, Palette, ShieldCheck, Sparkles, Tag, X as XIcon } from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
import type { BillingDetails, SubscriptionPlans } from '@orbit/shared/types/subscription'
import { apiClient } from '@/lib/api-client'
import { useBilling } from '@/hooks/use-billing'
import { useSubscriptionPlans, formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { useHasProAccess, useProfile, useTrialDaysLeft, useTrialExpired, useTrialUrgent } from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { colors } from '@/lib/theme'

type IconType = ComponentType<{ size?: number; color?: string }>

const trialExpiredFeatures = ['trial.expired.unlimitedHabits', 'trial.expired.aiChat', 'trial.expired.allColors', 'trial.expired.aiSummary', 'trial.expired.subHabits', 'trial.expired.retrospective']
const proFeatures = [{ key: 'unlimited', Icon: Flame }, { key: 'ai', Icon: MessageSquare }, { key: 'themes', Icon: Palette }, { key: 'adFree', Icon: ShieldCheck }]
const yearlyExtra = [{ key: 'retrospective', Icon: BarChart3 }]
const categories: { category: string; rows: { key: string; Icon: IconType; type: 'boolean' | 'text'; free?: boolean; pro?: boolean }[] }[] = [
  { category: 'habits', rows: [{ key: 'habits', Icon: Flame, type: 'text' }, { key: 'subHabits', Icon: Flame, type: 'boolean', free: false, pro: true }] },
  { category: 'ai', rows: [{ key: 'ai', Icon: MessageSquare, type: 'text' }, { key: 'aiMemory', Icon: MessageSquare, type: 'boolean', free: false, pro: true }, { key: 'summary', Icon: MessageSquare, type: 'boolean', free: false, pro: true }, { key: 'slipAlerts', Icon: ShieldCheck, type: 'boolean', free: false, pro: true }] },
  { category: 'insights', rows: [{ key: 'retrospective', Icon: BarChart3, type: 'boolean', free: false, pro: true }, { key: 'achievements', Icon: Flame, type: 'boolean', free: false, pro: true }] },
  { category: 'personalization', rows: [{ key: 'colors', Icon: Palette, type: 'text' }, { key: 'calendarImport', Icon: Flame, type: 'boolean', free: false, pro: true }, { key: 'adFree', Icon: ShieldCheck, type: 'boolean', free: false, pro: true }] },
]

function invoiceStatusColors(status: string) {
  if (status === 'paid') return { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.20)', text: colors.emerald400 }
  if (status === 'open') return { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.20)', text: colors.amber400 }
  return { bg: colors.surfaceElevated, border: colors.border, text: colors.textMuted }
}

export default function UpgradeScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US'
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const { plans, isLoading: isLoadingPlans, isError: isPlansError, refetch: refetchPlans, discountedAmount } = useSubscriptionPlans()
  const showBilling = hasProAccess && !profile?.isTrialActive
  const { billing, isLoading: isBillingLoading, isError: isBillingError, refetch: refetchBilling } = useBilling(showBilling)
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'yearly' | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalError, setPortalError] = useState('')

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100))
  }, [profile])

  async function handleCheckout(interval: 'monthly' | 'yearly') {
    setCheckoutLoading(interval)
    setCheckoutError('')
    try {
      const res = await apiClient<{ url?: string }>(API.subscription.checkout, { method: 'POST', body: JSON.stringify({ interval }) })
      if (res.url) await Linking.openURL(res.url)
    } catch (err: unknown) {
      setCheckoutError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    setPortalError('')
    try {
      const res = await apiClient<{ url?: string }>(API.subscription.portal, { method: 'POST' })
      if (res.url) await Linking.openURL(res.url)
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setPortalLoading(false)
    }
  }

  function usageCard() {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{t('upgrade.billing.usage.title')}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>{t('upgrade.billing.usage.aiMessages')}</Text>
          <Text style={[styles.text, styles.bold, usagePercent > 80 ? styles.warnText : null]}>{t('upgrade.billing.usage.aiMessagesOf', { used: profile?.aiMessagesUsed ?? 0, limit: profile?.aiMessagesLimit ?? 0 })}</Text>
        </View>
        <View style={styles.track}><View style={[styles.fill, usagePercent > 80 ? styles.fillWarn : null, { width: `${usagePercent}%` }]} /></View>
      </View>
    )
  }

  function planCards(data: SubscriptionPlans) {
    const monthly = data.couponPercentOff ? discountedAmount(data.monthly.unitAmount) : data.monthly.unitAmount
    const yearly = data.couponPercentOff ? discountedAmount(data.yearly.unitAmount) : data.yearly.unitAmount
    return (
      <View style={styles.stack}>
        <View style={[styles.card, styles.dashedCard]}>
          <View style={styles.rowBetween}><Text style={styles.label}>{t('upgrade.plans.free.name')}</Text><Text style={styles.priceSmall}>{formatPrice(0, data.currency)}</Text></View>
          <View style={styles.stackSmall}>
            <Text style={styles.muted}>{t('upgrade.plans.free.features.habits')}</Text>
            <Text style={styles.muted}>{t('upgrade.plans.free.features.ai')}</Text>
            <Text style={styles.muted}>{t('upgrade.plans.free.features.theme')}</Text>
            <Text style={[styles.muted, styles.warnText]}>{t('upgrade.plans.free.features.ads')}</Text>
          </View>
          {!hasProAccess ? <View style={styles.disabledBtn}><Text style={styles.disabledBtnText}>{t('upgrade.plans.free.cta')}</Text></View> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('upgrade.plans.monthly.name')}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(monthly, data.currency)}<Text style={styles.period}>{t('upgrade.plans.monthly.period')}</Text></Text>
            {data.couponPercentOff ? <Text style={styles.strike}>{formatPrice(data.monthly.unitAmount, data.currency)}</Text> : null}
          </View>
          {proFeatures.map(({ key, Icon }) => <View key={key} style={styles.iconRow}><Icon size={14} color={colors.primary} /><Text style={styles.text}>{t(`upgrade.plans.proFeatures.${key}`)}</Text></View>)}
          <TouchableOpacity style={[styles.secondaryBtn, checkoutLoading ? styles.disabled : null]} disabled={checkoutLoading !== null} onPress={() => handleCheckout('monthly')} activeOpacity={0.85}>
            {checkoutLoading === 'monthly' ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
            <Text style={styles.secondaryBtnText}>{t('upgrade.plans.monthly.cta')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.primaryCard]}>
          <View style={styles.badgeRow}>
            <View style={styles.primaryPill}><Text style={styles.primaryPillText}>{t('upgrade.plans.yearly.recommended')}</Text></View>
            <View style={styles.greenPill}><Text style={styles.greenPillText}>{t('upgrade.plans.savePercent', { percent: data.savingsPercent })}</Text></View>
          </View>
          <Text style={styles.title}>{t('upgrade.plans.yearly.name')}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(yearly, data.currency)}<Text style={styles.period}>{t('upgrade.plans.yearly.period')}</Text></Text>
            {data.couponPercentOff ? <Text style={styles.strike}>{formatPrice(data.yearly.unitAmount, data.currency)}</Text> : null}
          </View>
          <Text style={styles.muted}>{t('upgrade.plans.equivalent', { price: formatPrice(monthlyEquivalent(yearly), data.currency) })}</Text>
          <View style={styles.highlightBox}><BadgeCheck size={14} color={colors.primary} /><Text style={styles.text}>{t('upgrade.plans.yearly.includesMonthly')}</Text></View>
          {yearlyExtra.map(({ key, Icon }) => <View key={key} style={styles.iconRow}><Icon size={14} color={colors.primary} /><Text style={styles.text}>{t(`upgrade.plans.proFeatures.${key}`)}</Text></View>)}
          {data.couponPercentOff ? <View style={styles.iconRow}><Tag size={12} color={colors.emerald400} /><Text style={[styles.muted, styles.greenText]}>{t('upgrade.plans.coupon.appliedNote')}</Text></View> : null}
          <TouchableOpacity style={[styles.primaryBtn, checkoutLoading ? styles.disabled : null]} disabled={checkoutLoading !== null} onPress={() => handleCheckout('yearly')} activeOpacity={0.85}>
            {checkoutLoading === 'yearly' ? <ActivityIndicator size="small" color={colors.white} /> : null}
            <Text style={styles.primaryBtnText}>{t('upgrade.plans.yearly.cta')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function featureTable() {
    return (
      <View style={styles.stack}>
        <View style={styles.rowHeader}><Text style={[styles.label, styles.flex]}>{t('upgrade.feature')}</Text><Text style={styles.headerCell}>{t('upgrade.free')}</Text><Text style={[styles.headerCell, styles.primaryText]}>{t('common.proBadge')}</Text></View>
        {categories.map((group) => (
          <View key={group.category} style={styles.stackSmall}>
            <Text style={[styles.label, styles.primaryText]}>{t(`upgrade.categories.${group.category}`)}</Text>
            {group.rows.map((row) => (
              <View key={row.key} style={styles.tableRow}>
                <View style={styles.flex}>
                  <View style={styles.iconRow}><row.Icon size={15} color={colors.textMuted} /><Text style={styles.text}>{t(`upgrade.features.${row.key}.label`)}</Text></View>
                  <Text style={styles.hint}>{t(`upgrade.features.${row.key}.tooltip`)}</Text>
                </View>
                <View style={styles.cell}>{row.type === 'boolean' ? <>{row.free ? <Check size={16} color={colors.textMuted} /> : <XIcon size={16} color={colors.textFaded40} />}</> : <Text style={styles.cellText}>{t(`upgrade.features.${row.key}.free`)}</Text>}</View>
                <View style={styles.cell}>{row.type === 'boolean' ? <>{row.pro ? <Check size={16} color={colors.primary} /> : <XIcon size={16} color={colors.textFaded40} />}</> : <Text style={[styles.cellText, styles.primaryText]}>{t(`upgrade.features.${row.key}.pro`)}</Text>}</View>
              </View>
            ))}
          </View>
        ))}
      </View>
    )
  }

  function billingDashboard(data: BillingDetails | null) {
    if (isBillingLoading) {
      return <View style={styles.card}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.muted}>{t('common.loading')}</Text></View>
    }
    if (isBillingError && !data) {
      return <View style={styles.card}><AlertTriangle size={28} color={colors.textMuted} /><Text style={styles.text}>{t('upgrade.billing.error')}</Text><TouchableOpacity onPress={() => { refetchBilling().catch(() => {}) }}><Text style={styles.link}>{t('upgrade.billing.retry')}</Text></TouchableOpacity></View>
    }
    if (!data) {
      return <View style={styles.stack}><View style={styles.card}><Text style={styles.title}>{profile?.isLifetimePro ? t('upgrade.billing.plan.lifetime') : t('upgrade.alreadyPro')}</Text><Text style={styles.muted}>{profile?.isLifetimePro ? t('upgrade.billing.plan.lifetimeHint') : t('upgrade.manageHint')}</Text></View>{usageCard()}</View>
    }
    return (
      <View style={styles.stack}>
        <View style={styles.card}>
          <View style={styles.iconRow}><BadgeCheck size={20} color={colors.primary} /><Text style={styles.title}>{data.interval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}</Text></View>
          <Text style={styles.text}>{data.cancelAtPeriodEnd ? t('upgrade.billing.plan.canceledHint', { date: format(parseISO(data.currentPeriodEnd), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale }) }) : t('upgrade.billing.plan.renewsOn', { date: format(parseISO(data.currentPeriodEnd), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale }) })}</Text>
          {data.amountPerPeriod > 0 ? <Text style={styles.muted}>{formatPrice(data.amountPerPeriod, data.currency)}{data.interval === 'yearly' ? t('upgrade.plans.yearly.period') : t('upgrade.plans.monthly.period')}</Text> : null}
        </View>

        {data.paymentMethod ? <View style={styles.card}><View style={styles.rowBetween}><View style={[styles.iconRow, styles.flex]}><CreditCard size={20} color={colors.textMuted} /><View style={styles.flex}><Text style={styles.text}>{t('upgrade.billing.payment.card', { brand: data.paymentMethod.brand.charAt(0).toUpperCase() + data.paymentMethod.brand.slice(1), last4: data.paymentMethod.last4 })}</Text><Text style={styles.muted}>{t('upgrade.billing.payment.expires', { month: String(data.paymentMethod.expMonth).padStart(2, '0'), year: data.paymentMethod.expYear })}</Text></View></View><TouchableOpacity style={styles.inlineBtn} onPress={handlePortal} disabled={portalLoading}><Text style={styles.inlineBtnText}>{t('upgrade.billing.payment.change')}</Text></TouchableOpacity></View></View> : null}

        {usageCard()}

        {data.recentInvoices.length > 0 ? <View style={styles.card}><Text style={styles.label}>{t('upgrade.billing.invoices.title')}</Text>{data.recentInvoices.map((invoice, index) => { const state = invoiceStatusColors(invoice.status); const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl; return <View key={invoice.id} style={[styles.invoiceRow, index < data.recentInvoices.length - 1 ? styles.invoiceBorder : null]}><View style={styles.flex}><View style={styles.iconRow}><Text style={styles.text}>{format(parseISO(invoice.date), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale })}</Text><View style={styles.reasonPill}><Text style={styles.reasonText}>{({ subscription_create: t('upgrade.billing.invoices.reasonCreate'), subscription_cycle: t('upgrade.billing.invoices.reasonCycle'), subscription_update: t('upgrade.billing.invoices.reasonUpdate'), manual: t('upgrade.billing.invoices.reasonManual') } as Record<string, string>)[invoice.billingReason] ?? invoice.billingReason}</Text></View></View><View style={[styles.statusPill, { backgroundColor: state.bg, borderColor: state.border }]}><Text style={[styles.statusText, { color: state.text }]}>{({ paid: t('upgrade.billing.invoices.statusPaid'), open: t('upgrade.billing.invoices.statusOpen'), void: t('upgrade.billing.invoices.statusVoid') } as Record<string, string>)[invoice.status] ?? invoice.status}</Text></View></View><View style={styles.iconRow}><Text style={styles.boldText}>{formatPrice(invoice.amountPaid, invoice.currency)}</Text>{url ? <TouchableOpacity onPress={() => { Linking.openURL(url).catch(() => {}) }}><Download size={16} color={colors.textMuted} /></TouchableOpacity> : null}</View></View> })}</View> : null}

        <View style={styles.stackSmall}>
          <TouchableOpacity style={[styles.secondaryBtn, portalLoading ? styles.disabled : null]} onPress={handlePortal} disabled={portalLoading}><Text style={styles.secondaryBtnText}>{t('upgrade.billing.actions.manage')}</Text></TouchableOpacity>
          <Text style={styles.centerMuted}>{t('upgrade.billing.actions.manageHint')}</Text>
          {portalError ? <Text style={styles.error}>{portalError}</Text> : null}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => router.push('/profile')} activeOpacity={0.7}><ArrowLeft size={20} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={styles.screenTitle}>{t('upgrade.title')}</Text>
        </View>

        {showBilling ? billingDashboard(billing) : (
          <View style={styles.stack}>
            {profile?.isTrialActive ? <View style={[styles.banner, trialUrgent ? styles.bannerWarn : null]}><Clock size={18} color={trialUrgent ? colors.amber400 : colors.primary} /><Text style={[styles.text, styles.flex, trialUrgent ? styles.warnText : null]}>{trialDaysLeft === 0 ? t('trial.banner.lastDay') : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}</Text></View> : null}
            {trialExpired ? <View style={styles.card}><View style={styles.iconRow}><Sparkles size={18} color={colors.primary} /><Text style={styles.title}>{t('trial.expired.title')}</Text></View><Text style={styles.label}>{t('trial.expired.dontLose')}</Text>{trialExpiredFeatures.map((feature) => <View key={feature} style={styles.iconRow}><CheckCircle2 size={16} color={colors.primary} /><Text style={styles.text}>{t(feature)}</Text></View>)}</View> : null}
            {isLoadingPlans ? <View style={styles.card}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.muted}>{t('common.loading')}</Text></View> : null}
            {isPlansError && !plans && !isLoadingPlans ? <View style={styles.card}><AlertTriangle size={28} color={colors.textMuted} /><Text style={styles.text}>{t('upgrade.plans.error')}</Text><TouchableOpacity onPress={() => { refetchPlans().catch(() => {}) }}><Text style={styles.link}>{t('upgrade.plans.retry')}</Text></TouchableOpacity></View> : null}
            {plans ? planCards(plans) : null}
            {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
            {featureTable()}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  back: { padding: 8, marginLeft: -8 },
  screenTitle: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  stack: { gap: 12 },
  stackSmall: { gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  dashedCard: { borderStyle: 'dashed' },
  primaryCard: { borderColor: colors.primary_30 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primary_10, borderRadius: 20, borderWidth: 1, borderColor: colors.primary_20, padding: 16 },
  bannerWarn: { backgroundColor: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.20)' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  screenSub: { fontSize: 14, color: colors.textSecondary },
  text: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  muted: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  centerMuted: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.textMuted },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
  error: { fontSize: 12, color: colors.red400, textAlign: 'center' },
  warnText: { color: colors.amber400 },
  greenText: { color: colors.emerald400 },
  primaryText: { color: colors.primary },
  bold: { fontWeight: '700' },
  boldText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  flex: { flex: 1 },
  price: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  priceSmall: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  period: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 },
  strike: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'line-through' },
  disabledBtn: { minHeight: 44, borderRadius: 16, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  disabledBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  secondaryBtn: { minHeight: 46, borderRadius: 16, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  primaryBtn: { minHeight: 50, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
  disabled: { opacity: 0.55 },
  primaryPill: { backgroundColor: colors.primary_15, borderWidth: 1, borderColor: colors.primary_20, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  greenPill: { backgroundColor: 'rgba(52,211,153,0.10)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.20)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  primaryPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: colors.primary },
  greenPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: colors.emerald400 },
  highlightBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary_10, borderWidth: 1, borderColor: colors.primary_20, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  track: { width: '100%', height: 6, borderRadius: 999, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  fillWarn: { backgroundColor: colors.amber400 },
  headerCell: { width: 56, fontSize: 10, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', color: colors.textMuted },
  tableRow: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' },
  hint: { fontSize: 11, color: colors.textMuted, lineHeight: 16, paddingLeft: 23 },
  cell: { width: 56, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  inlineBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  inlineBtnText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  invoiceBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
  reasonPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  reasonText: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
})
