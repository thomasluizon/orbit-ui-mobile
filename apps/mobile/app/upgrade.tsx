import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  CreditCard,
  Download,
  Flame,
  MessageSquare,
  Palette,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  X as XIcon,
} from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { applySubscriptionDiscount, formatLocaleDate, getErrorMessage, playManageSubscriptionUrl } from '@orbit/shared/utils'
import {
  TRIAL_EXPIRED_FEATURE_KEYS,
  UPGRADE_FEATURE_CATEGORIES,
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
  type UpgradeIconKey,
} from '@orbit/shared/utils/upgrade'
import type {
  BillingDetails,
  SubscriptionPlans,
} from '@orbit/shared/types/subscription'
import { apiClient } from '@/lib/api-client'
import { useBilling } from '@/hooks/use-billing'
import { usePlayBilling, type PlayOffer } from '@/hooks/use-play-billing'
import {
  useSubscriptionPlans,
  formatPrice,
  monthlyEquivalent,
} from '@/hooks/use-subscription-plans'
import {
  useHasProAccess,
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
  useTrialUrgent,
} from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'
import { AppBar } from '@/components/ui/app-bar'
import { Badge } from '@/components/ui/badge'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { PlanCard } from '@/components/upgrade/plan-card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { VerifiedBadge } from '@/components/ui/verified-badge'

type Tokens = ReturnType<typeof createTokensV2>
type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
type SubscriptionInterval = 'monthly' | 'yearly'
type UpgradeTextFn = (key: string, params?: Record<string, unknown>) => string

const upgradeIconMap = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
} satisfies Record<UpgradeIconKey, IconType>

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function invoiceStatusColor(status: string, tokens: Tokens): string {
  if (status === 'paid') return tokens.statusDone
  if (status === 'open') return tokens.statusOverdue
  return tokens.fg3
}

function formatBillingDate(isoDate: string, locale: string) {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function monthlyEquivalentPriceLabel(plans: SubscriptionPlans, yearlyOffer: PlayOffer | null): string {
  if (yearlyOffer?.priceAmountMicros) {
    return formatPrice(
      monthlyEquivalent(Math.round(Number(yearlyOffer.priceAmountMicros) / 10_000)),
      yearlyOffer.currency ?? plans.currency,
    )
  }
  const discountedYearly = applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff)
  return formatPrice(monthlyEquivalent(discountedYearly), plans.currency)
}

function UsageCard({
  usagePercent,
  usageUrgent,
  profile,
  t,
  tokens,
}: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.cardLabel, { color: tokens.fg3 }]}>
        {t('upgrade.billing.usage.title')}
      </Text>
      <View style={styles.usageRow}>
        <Text style={[styles.usageLabel, { color: tokens.fg1 }]}>
          {t('upgrade.billing.usage.aiMessages')}
        </Text>
        <Text
          style={[
            styles.usageValue,
            { color: usageUrgent ? tokens.statusOverdue : tokens.fg2 },
          ]}
        >
          {t('upgrade.billing.usage.aiMessagesOf', {
            used: profile?.aiMessagesUsed ?? 0,
            limit: profile?.aiMessagesLimit ?? 0,
          })}
        </Text>
      </View>
      <ProgressBar
        progress={usagePercent / 100}
        label={t('upgrade.billing.usage.aiMessages')}
        color={usageUrgent ? tokens.statusOverdue : undefined}
      />
    </View>
  )
}

function PlanSelection({
  plans,
  yearlyOffer,
  monthlyPrice,
  yearlyPrice,
  selectedInterval,
  onSelectInterval,
  t,
}: Readonly<{
  plans: SubscriptionPlans
  yearlyOffer: PlayOffer | null
  monthlyPrice?: string
  yearlyPrice?: string
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  t: UpgradeTextFn
}>) {
  const yearlyCharge = yearlyPrice
    ?? formatPrice(applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff), plans.currency)
  const monthlyCharge = monthlyPrice
    ?? formatPrice(applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff), plans.currency)
  const discountSuffix = !yearlyPrice && plans.couponPercentOff
    ? ` · ${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
    : ''

  return (
    <View accessibilityRole="radiogroup" style={styles.planGroup}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={t('upgrade.plans.equivalent', {
          price: monthlyEquivalentPriceLabel(plans, yearlyOffer),
        })}
        sub={`${yearlyCharge}${t('upgrade.plans.yearly.period')}${discountSuffix}`}
        features={[
          t('upgrade.plans.yearly.includesMonthly'),
          ...UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) =>
            t(`upgrade.plans.proFeatures.${feature.key}`),
          ),
        ]}
        selected={selectedInterval === 'yearly'}
        onSelect={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${monthlyCharge}${t('upgrade.plans.monthly.period')}`}
        features={UPGRADE_PRO_FEATURES.map((feature) =>
          t(`upgrade.plans.proFeatures.${feature.key}`),
        )}
        selected={selectedInterval === 'monthly'}
        onSelect={() => onSelectInterval('monthly')}
      />
    </View>
  )
}

function TrialExpiredCard({
  t,
  tokens,
}: Readonly<{
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View
      style={[
        styles.card,
        styles.expiredCard,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
    >
      <View style={styles.expiredHeader}>
        <Sparkles size={18} strokeWidth={1.8} color={tokens.primarySoft} />
        <Text style={[styles.expiredTitle, { color: tokens.fg1 }]}>
          {t('trial.expired.title')}
        </Text>
      </View>
      <Text style={[styles.expiredSub, { color: tokens.fg3 }]}>
        {t('trial.expired.dontLose')}
      </Text>
      <View style={styles.expiredList}>
        {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
          <View key={feature} style={styles.featureCheckRow}>
            <Check size={16} strokeWidth={2.4} color={tokens.primarySoft} />
            <Text style={[styles.featureCheckText, { color: tokens.fg2 }]}>
              {t(feature)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function FeatureComparisonTable({
  t,
  tokens,
}: Readonly<{
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={styles.comparisonPad}>
      <View style={styles.comparisonHeader}>
        <Text style={[styles.comparisonEyebrow, styles.comparisonLabelCell, { color: tokens.fg3 }]}>
          {t('upgrade.feature')}
        </Text>
        <Text style={[styles.comparisonEyebrow, styles.comparisonCell, { color: tokens.fg3 }]}>
          {t('upgrade.free')}
        </Text>
        <Text style={[styles.comparisonEyebrow, styles.comparisonCell, { color: tokens.primarySoft }]}>
          {t('common.proBadge')}
        </Text>
      </View>
      {UPGRADE_FEATURE_CATEGORIES.map((group) => (
        <View key={group.category}>
          <Text style={[styles.comparisonCategory, { color: tokens.fg1 }]}>
            {t(`upgrade.categories.${group.category}`)}
          </Text>
          {group.features.map((row) => {
            const Icon = upgradeIconMap[row.iconKey]
            return (
              <View
                key={row.key}
                style={[styles.comparisonRow, { borderBottomColor: tokens.hairline }]}
              >
                <View style={styles.comparisonLabelGroup}>
                  <Icon size={16} strokeWidth={1.8} color={tokens.fg3} />
                  <Text
                    style={[styles.comparisonLabel, { color: tokens.fg2 }]}
                    numberOfLines={1}
                  >
                    {t(`upgrade.features.${row.key}.label`)}
                  </Text>
                </View>
                <View style={styles.comparisonCell}>
                  {row.type === 'boolean' ? (
                    row.freeEnabled ? (
                      <Check size={16} strokeWidth={2.4} color={tokens.fg3} />
                    ) : (
                      <XIcon size={16} strokeWidth={1.8} color={tokens.fg4} />
                    )
                  ) : (
                    <Text style={[styles.comparisonCellText, { color: tokens.fg3 }]}>
                      {t(`upgrade.features.${row.key}.free`)}
                    </Text>
                  )}
                </View>
                <View style={styles.comparisonCell}>
                  {row.type === 'boolean' ? (
                    row.proEnabled ? (
                      <Check size={16} strokeWidth={2.4} color={tokens.primarySoft} />
                    ) : (
                      <XIcon size={16} strokeWidth={1.8} color={tokens.fg4} />
                    )
                  ) : (
                    <Text style={[styles.comparisonCellText, { color: tokens.fg1 }]}>
                      {t(`upgrade.features.${row.key}.pro`)}
                    </Text>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export default function UpgradeScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>()
  const goBackOrFallback = useGoBackOrFallback()
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const locale = i18n.language
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const {
    plans,
    isLoading: isLoadingPlans,
    isError: isPlansError,
    refetch: refetchPlans,
  } = useSubscriptionPlans()
  const playBilling = usePlayBilling({ preferReferralOffer: !!plans?.couponPercentOff })
  const isPlaySource = profile?.subscriptionSource === 'play'
  const showBilling = hasProAccess && !profile?.isTrialActive
  const {
    billing,
    isLoading: isBillingLoading,
    isError: isBillingError,
    refetch: refetchBilling,
  } = useBilling(showBilling && !isPlaySource && !profile?.isLifetimePro)
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionInterval | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [prevProcessing, setPrevProcessing] = useState(false)
  const fallbackRoute = getUpgradeFallbackRoute(from, '/profile')

  if (prevProcessing !== playBilling.isProcessing) {
    setPrevProcessing(playBilling.isProcessing)
    if (!playBilling.isProcessing) setCheckoutLoading(null)
  }

  const checkoutError = playBilling.errorKey ? t(playBilling.errorKey) : ''

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(
      100,
      Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100),
    )
  }, [profile])

  const usageProfile = profile
    ? {
        aiMessagesUsed: profile.aiMessagesUsed,
        aiMessagesLimit: profile.aiMessagesLimit,
      }
    : null

  const showsProPanel =
    showBilling && !isPlaySource && !billing && !isBillingLoading && !isBillingError
  const showGradient = !showBilling || showsProPanel

  function handleCheckout(interval: SubscriptionInterval) {
    if (!isOnline) return
    playBilling.clearError()
    setCheckoutLoading(interval)
    void playBilling.purchase(interval)
  }

  function handleManagePlay() {
    setPortalError('')
    Linking.openURL(playManageSubscriptionUrl()).catch((err: unknown) =>
      setPortalError(getErrorMessage(err, t('auth.genericError'))),
    )
  }

  async function handlePortal() {
    if (!isOnline) {
      setPortalError(t('calendarSync.notConnected'))
      return
    }

    setPortalLoading(true)
    setPortalError('')
    try {
      const res = await apiClient<{ url?: string }>(API.subscription.portal, {
        method: 'POST',
      })
      if (res.url) await Linking.openURL(res.url)
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setPortalLoading(false)
    }
  }

  function renderPlanSummaryCard(planLabel: string, meta?: string, badges?: ReactNode) {
    return (
      <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        <Text style={[styles.cardLabel, { color: tokens.fg3 }]}>
          {t('upgrade.billing.plan.title')}
        </Text>
        <View style={styles.cardValueRow}>
          <Text style={[styles.cardValue, { color: tokens.fg1 }]}>{planLabel}</Text>
          {badges}
        </View>
        {meta ? (
          <Text style={[styles.cardMeta, { color: tokens.fg3 }]}>{meta}</Text>
        ) : null}
      </View>
    )
  }

  function renderPlayBillingDashboard() {
    return (
      <>
        {renderPlanSummaryCard(
          profile?.subscriptionInterval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : t('upgrade.billing.plan.monthly'),
          profile?.planExpiresAt
            ? t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(profile.planExpiresAt, locale),
              })
            : undefined,
        )}
        <UsageCard
          usagePercent={usagePercent}
          usageUrgent={usagePercent > 80}
          profile={usageProfile}
          t={t}
          tokens={tokens}
        />
        <View style={styles.actionPad}>
          <PillButton
            variant="white"
            fullWidth
            onPress={handleManagePlay}
            leading={<Settings size={18} strokeWidth={1.8} color={tokens.bg} />}
          >
            {t('upgrade.billing.actions.managePlay')}
          </PillButton>
          <Text style={[styles.centerMuted, { color: tokens.fg4 }]}>
            {t('upgrade.billing.actions.managePlayHint')}
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

  function renderProActivePanel() {
    return (
      <>
        <View style={styles.proPanel}>
          <VerifiedBadge size={84} />
          <Text style={[styles.proPanelTitle, { color: tokens.fg1 }]}>
            {profile?.isLifetimePro
              ? t('upgrade.billing.plan.lifetime')
              : t('upgrade.alreadyPro')}
          </Text>
          <Text style={[styles.proPanelHint, { color: tokens.fg3 }]}>
            {profile?.isLifetimePro
              ? t('upgrade.billing.plan.lifetimeHint')
              : t('upgrade.manageHint')}
          </Text>
        </View>
        <UsageCard
          usagePercent={usagePercent}
          usageUrgent={usagePercent > 80}
          profile={usageProfile}
          t={t}
          tokens={tokens}
        />
      </>
    )
  }

  function renderInvoices(data: BillingDetails) {
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

  function renderBillingDashboard(data: BillingDetails | null) {
    if (isBillingLoading) {
      return (
        <View style={styles.padBlock}>
          <ActivityIndicator size="small" color={tokens.primary} />
          <Text style={[styles.mutedMeta, { color: tokens.fg3 }]}>
            {t('common.loading')}
          </Text>
        </View>
      )
    }
    if (isBillingError && !data) {
      if (!isOnline) {
        return (
          <View style={styles.padBlock}>
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('upgrade.billing.actions.manage')} / ${t('upgrade.billing.payment.change')}`}
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
            onPress={() => {
              refetchBilling().catch(() => {})
            }}
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
      return renderProActivePanel()
    }
    return (
      <>
        {renderPlanSummaryCard(
          data.interval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : t('upgrade.billing.plan.monthly'),
          data.cancelAtPeriodEnd
            ? t('upgrade.billing.plan.canceledHint', {
                date: formatBillingDate(data.currentPeriodEnd, locale),
              })
            : t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(data.currentPeriodEnd, locale),
              }),
          <>
            {data.cancelAtPeriodEnd ? (
              <Badge tone="amber">{t('upgrade.billing.plan.canceledBadge')}</Badge>
            ) : null}
            {data.status === 'past_due' && !data.cancelAtPeriodEnd ? (
              <View
                style={[
                  styles.badBadge,
                  { backgroundColor: rgbaFromHex(tokens.statusBad, 0.18) },
                ]}
              >
                <Text style={[styles.badBadgeText, { color: tokens.statusBad }]}>
                  {t('upgrade.billing.plan.pastDue')}
                </Text>
              </View>
            ) : null}
          </>,
        )}

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
              onPress={handlePortal}
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

        {renderInvoices(data)}

        <View style={styles.actionPad}>
          <PillButton
            variant="white"
            fullWidth
            onPress={handlePortal}
            disabled={portalLoading || !isOnline}
            leading={<Settings size={18} strokeWidth={1.8} color={tokens.bg} />}
          >
            {t('upgrade.billing.actions.manage')}
          </PillButton>
          <Text style={[styles.centerMuted, { color: tokens.fg4 }]}>
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

  function renderPricingSection() {
    return (
      <>
        <Text style={[styles.heroTitle, { color: tokens.fg1 }]}>
          {t('upgrade.heroTitle')}
        </Text>

        {profile?.isTrialActive ? (
          <View
            style={[
              styles.trialStrip,
              trialUrgent
                ? {
                    backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.1),
                    borderColor: rgbaFromHex(tokens.statusOverdue, 0.28),
                  }
                : {
                    backgroundColor: tintFromPrimary(tokens, 0.08),
                    borderColor: tintFromPrimary(tokens, 0.18),
                  },
            ]}
          >
            <Clock
              size={16}
              strokeWidth={1.8}
              color={trialUrgent ? tokens.statusOverdue : tokens.primarySoft}
            />
            <Text
              style={[
                styles.trialStripText,
                { color: trialUrgent ? tokens.statusOverdue : tokens.fg1 },
              ]}
            >
              {trialDaysLeft === 0
                ? t('trial.banner.lastDay')
                : plural(
                    t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
                    trialDaysLeft ?? 0,
                  )}
            </Text>
          </View>
        ) : null}

        {trialExpired ? <TrialExpiredCard t={t} tokens={tokens} /> : null}

        {isLoadingPlans ? (
          <View style={styles.padBlock}>
            <ActivityIndicator size="small" color={tokens.primary} />
            <Text style={[styles.mutedMeta, { color: tokens.fg3 }]}>
              {t('common.loading')}
            </Text>
          </View>
        ) : null}

        {isPlansError && !plans && !isLoadingPlans && isOnline ? (
          <View style={styles.padBlock}>
            <AlertTriangle size={26} strokeWidth={1.8} color={tokens.fg3} />
            <Text style={[styles.noticeText, { color: tokens.fg2 }]}>
              {t('upgrade.plans.error')}
            </Text>
            <Pressable
              onPress={() => {
                refetchPlans().catch(() => {})
              }}
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
                {t('upgrade.plans.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {plans ? (
          <>
            <PlanSelection
              plans={plans}
              yearlyOffer={playBilling.yearlyOffer}
              monthlyPrice={playBilling.monthlyOffer?.displayPrice}
              yearlyPrice={playBilling.yearlyOffer?.displayPrice}
              selectedInterval={selectedInterval}
              onSelectInterval={setSelectedInterval}
              t={t}
            />

            <View style={styles.actionPad}>
              {playBilling.isReferralPricing ? (
                <View style={styles.couponRow}>
                  <Tag size={13} strokeWidth={1.8} color={tokens.statusDone} />
                  <Text style={[styles.couponNote, { color: tokens.statusDone }]}>
                    {t('upgrade.plans.coupon.appliedNote')}
                  </Text>
                </View>
              ) : null}
              <PillButton
                fullWidth
                disabled={checkoutLoading !== null}
                onPress={() => handleCheckout(selectedInterval)}
                leading={
                  checkoutLoading ? (
                    <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
                  ) : (
                    <Sparkles size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />
                  )
                }
              >
                {trialExpired
                  ? t('trial.expired.subscribe')
                  : selectedInterval === 'yearly'
                    ? t('upgrade.plans.yearly.cta')
                    : t('upgrade.plans.monthly.cta')}
              </PillButton>
              {checkoutLoading ? (
                <Text style={[styles.mutedMeta, { color: tokens.fg3 }]}>
                  {t('common.loading')}
                </Text>
              ) : null}
              {checkoutError ? (
                <Text style={[styles.errorText, { color: tokens.statusBad }]}>
                  {checkoutError}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  void playBilling.restorePurchases()
                }}
                disabled={playBilling.isRestoring}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionChip,
                  {
                    backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                    borderColor: tokens.hairline,
                  },
                  pressed ? styles.pressedScale : null,
                ]}
              >
                {playBilling.isRestoring ? (
                  <ActivityIndicator size="small" color={tokens.fg3} />
                ) : (
                  <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>
                    {t('upgrade.restorePurchase')}
                  </Text>
                )}
              </Pressable>
              <Text style={[styles.renewalNote, { color: tokens.fg4 }]}>
                {t('upgrade.plans.renewalNote')}
              </Text>
            </View>
          </>
        ) : null}

        <FeatureComparisonTable t={t} tokens={tokens} />
      </>
    )
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      {showGradient ? <GradientTop height={260} /> : null}
      <AppBar
        back
        onBack={() => goBackOrFallback(fallbackRoute)}
        title={t('upgrade.title')}
        backLabel={t('common.goBack')}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isOnline ? (
          <View style={styles.padBlock}>
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('upgrade.billing.actions.manage')} / ${t('upgrade.plans.monthly.cta')} / ${t('upgrade.plans.yearly.cta')}`}
              compact
            />
          </View>
        ) : null}

        {showBilling
          ? isPlaySource
            ? renderPlayBillingDashboard()
            : renderBillingDashboard(billing)
          : renderPricingSection()}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  bottomSpace: { height: 24 },
  heroTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.24,
    marginHorizontal: 20,
    marginBottom: 22,
  },
  trialStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  trialStripText: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  cardLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },
  cardValue: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 17,
  },
  cardMeta: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  badBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badBadgeText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.63,
    textTransform: 'uppercase',
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  usageLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
  },
  usageValue: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  proPanel: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 16,
    gap: 10,
  },
  proPanelTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 24,
    letterSpacing: -0.24,
    lineHeight: 31,
    marginTop: 8,
    textAlign: 'center',
  },
  proPanelHint: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
    textAlign: 'center',
  },
  expiredCard: {
    marginBottom: 16,
    paddingVertical: 18,
  },
  expiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  expiredTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
  expiredSub: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    marginTop: 6,
  },
  expiredList: {
    gap: 9,
    marginTop: 12,
  },
  featureCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCheckText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    flexShrink: 1,
  },
  planGroup: {
    paddingHorizontal: 20,
    gap: 14,
  },
  actionPad: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 4,
    gap: 12,
    alignItems: 'center',
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponNote: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
  },
  renewalNote: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginHorizontal: 4,
  },
  restoreLink: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedScale: {
    transform: [{ scale: 0.96 }],
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  padBlock: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    alignItems: 'center',
  },
  noticeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  mutedMeta: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
  centerMuted: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invoiceIconSlot: {
    width: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  invoiceMeta: { flex: 1 },
  invoiceDate: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    marginTop: 3,
  },
  invoiceStatus: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  invoiceAmount: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
  },
  comparisonPad: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 6,
  },
  comparisonEyebrow: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  comparisonCategory: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    letterSpacing: -0.15,
    paddingTop: 18,
    paddingBottom: 4,
  },
  comparisonLabelCell: {
    flex: 1,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonLabelGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  comparisonLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    flexShrink: 1,
  },
  comparisonCell: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonCellText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
})
