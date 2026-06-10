import { useMemo, useState, type ComponentType } from 'react'
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
  CheckCircle2,
  Clock,
  Download,
  Flame,
  MessageSquare,
  Palette,
  ShieldCheck,
  Sparkles,
  X as XIcon,
} from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { formatLocaleDate, getErrorMessage, playManageSubscriptionUrl } from '@orbit/shared/utils'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'

type Tokens = ReturnType<typeof createTokensV2>
type IconType = ComponentType<{ size?: number; color?: string }>

const upgradeIconMap = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
} satisfies Record<UpgradeIconKey, IconType>

function invoiceStatusColors(status: string, tokens: Tokens) {
  if (status === 'paid')
    return { text: tokens.statusDone }
  if (status === 'open')
    return { text: tokens.statusOverdue }
  return { text: tokens.fg3 }
}

function formatBillingDate(isoDate: string, locale: string) {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type UpgradeTextFn = (key: string, params?: Record<string, unknown>) => string

function monthlyEquivalentPriceLabel(plans: SubscriptionPlans, yearlyOffer: PlayOffer | null): string {
  if (yearlyOffer?.priceAmountMicros) {
    return formatPrice(
      monthlyEquivalent(Math.round(Number(yearlyOffer.priceAmountMicros) / 10_000)),
      yearlyOffer.currency ?? plans.currency,
    )
  }
  return formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency)
}

function PlanRow({
  tokens,
  label,
  price,
  sub,
  active,
  current,
  onPress,
  pending,
  badge,
}: Readonly<{
  tokens: Tokens
  label: string
  price: string
  sub?: string
  active?: boolean
  current?: boolean
  onPress?: () => void
  pending?: boolean
  badge?: string
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || pending}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[
        styles.planRow,
        {
          borderColor: active ? tokens.fg3 : tokens.hairlineStrong,
          backgroundColor: active ? tokens.bgElev : 'transparent',
        },
      ]}
    >
      <View style={styles.planTop}>
        <View style={styles.planLabelGroup}>
          <Text style={[styles.planLabel, { color: tokens.fg1 }]}>
            {label}
          </Text>
          {current ? (
            <View
              style={[
                styles.currentBadge,
                { borderColor: tokens.hairlineStrong },
              ]}
            >
              <Text
                style={[styles.currentBadgeText, { color: tokens.fg3 }]}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.planPrice, { color: tokens.fg1 }]}>
          {price}
        </Text>
      </View>
      {sub ? (
        <Text style={[styles.planSub, { color: tokens.fg3 }]}>{sub}</Text>
      ) : null}
      {pending ? (
        <ActivityIndicator size="small" color={tokens.primary} />
      ) : null}
    </Pressable>
  )
}

function UsageBlock({
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
    <>
      <SectionLabel>{t('upgrade.billing.usage.title')}</SectionLabel>
      <SettingsRow
        label={t('upgrade.billing.usage.aiMessages')}
        value={t('upgrade.billing.usage.aiMessagesOf', {
          used: profile?.aiMessagesUsed ?? 0,
          limit: profile?.aiMessagesLimit ?? 0,
        })}
        valueColor={usageUrgent ? tokens.statusOverdue : tokens.fg3}
        accessory="none"
        mono
        divider={false}
      />
      <View style={styles.usagePad}>
        <View
          style={[styles.usageTrack, { backgroundColor: tokens.bgSunk }]}
        >
          <View
            style={[
              styles.usageFill,
              {
                width: `${Math.min(100, Math.max(0, usagePercent))}%`,
                backgroundColor: usageUrgent
                  ? tokens.statusOverdue
                  : tokens.primary,
              },
            ]}
          />
        </View>
      </View>
    </>
  )
}

function PlanCards({
  plans,
  hasProAccess,
  checkoutLoading,
  onCheckout,
  monthlyPrice,
  yearlyPrice,
  t,
  tokens,
}: Readonly<{
  plans: SubscriptionPlans
  hasProAccess: boolean
  checkoutLoading: 'monthly' | 'yearly' | null
  onCheckout: (interval: 'monthly' | 'yearly') => void
  monthlyPrice?: string
  yearlyPrice?: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <>
      <SectionLabel>{t('upgrade.plan')}</SectionLabel>

      <PlanRow
        tokens={tokens}
        label={t('upgrade.plans.free.name')}
        price={formatPrice(0, plans.currency)}
        sub={t('upgrade.plans.free.features.habits')}
        current={!hasProAccess}
        badge={t('upgrade.currentPlan')}
      />

      <PlanRow
        tokens={tokens}
        label={t('upgrade.plans.monthly.name')}
        price={`${monthlyPrice ?? formatPrice(plans.monthly.unitAmount, plans.currency)}${t('upgrade.plans.monthly.period')}`}
        onPress={() => onCheckout('monthly')}
        pending={checkoutLoading === 'monthly'}
      />

      <PlanRow
        tokens={tokens}
        label={t('upgrade.plans.yearly.name')}
        price={`${yearlyPrice ?? formatPrice(plans.yearly.unitAmount, plans.currency)}${t('upgrade.plans.yearly.period')}`}
        sub={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        active
        onPress={() => onCheckout('yearly')}
        pending={checkoutLoading === 'yearly'}
      />

      <View style={styles.proFeaturesPad}>
        {UPGRADE_PRO_FEATURES.map((feature) => {
          const Icon = upgradeIconMap[feature.iconKey]
          return (
            <View key={feature.key} style={styles.proFeatureRow}>
              <Icon size={14} color={tokens.primary} />
              <Text style={[styles.proFeatureText, { color: tokens.fg2 }]}>
                {t(`upgrade.plans.proFeatures.${feature.key}`)}
              </Text>
            </View>
          )
        })}
      </View>

      <SectionLabel>{t('upgrade.plans.yearly.includesMonthly')}</SectionLabel>
      <View style={styles.proFeaturesPad}>
        {UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => {
          const Icon = upgradeIconMap[feature.iconKey]
          return (
            <View key={feature.key} style={styles.proFeatureRow}>
              <Icon size={14} color={tokens.primary} />
              <Text style={[styles.proFeatureText, { color: tokens.fg2 }]}>
                {t(`upgrade.plans.proFeatures.${feature.key}`)}
              </Text>
            </View>
          )
        })}
      </View>
    </>
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
    <>
      <SectionLabel>{t('upgrade.feature')}</SectionLabel>
      {UPGRADE_FEATURE_CATEGORIES.map((group) => (
        <View key={group.category}>
          <View style={styles.featureCategoryRow}>
            <Text
              style={[styles.featureCategoryLabel, { color: tokens.fg3 }]}
            >
              {t(`upgrade.categories.${group.category}`)}
            </Text>
          </View>
          {group.features.map((row) => {
            const Icon = upgradeIconMap[row.iconKey]
            return (
              <View
                key={row.key}
                style={[
                  styles.featureRow,
                  { borderBottomColor: tokens.hairline },
                ]}
              >
                <View style={styles.featureLabelGroup}>
                  <Icon size={15} color={tokens.fg3} />
                  <Text
                    style={[styles.featureLabel, { color: tokens.fg2 }]}
                    numberOfLines={1}
                  >
                    {t(`upgrade.features.${row.key}.label`)}
                  </Text>
                </View>
                <View style={styles.featureCell}>
                  {row.type === 'boolean' ? (
                    row.freeEnabled ? (
                      <Check size={14} color={tokens.fg3} />
                    ) : (
                      <XIcon size={14} color={tokens.fg4} />
                    )
                  ) : (
                    <Text
                      style={[styles.featureCellText, { color: tokens.fg3 }]}
                    >
                      {t(`upgrade.features.${row.key}.free`)}
                    </Text>
                  )}
                </View>
                <View style={styles.featureCell}>
                  {row.type === 'boolean' ? (
                    row.proEnabled ? (
                      <Check size={14} color={tokens.fg1} />
                    ) : (
                      <XIcon size={14} color={tokens.fg4} />
                    )
                  ) : (
                    <Text
                      style={[styles.featureCellText, { color: tokens.fg1 }]}
                    >
                      {t(`upgrade.features.${row.key}.pro`)}
                    </Text>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      ))}
    </>
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
  const styles = useMemo(() => createStyles(tokens), [tokens])
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
  const [checkoutLoading, setCheckoutLoading] = useState<
    'monthly' | 'yearly' | null
  >(null)
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

  function handleCheckout(interval: 'monthly' | 'yearly') {
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

  function renderPlayBillingDashboard() {
    return (
      <>
        <SectionLabel>{t('upgrade.billing.plan.title')}</SectionLabel>
        <SettingsRow
          label={
            profile?.subscriptionInterval === 'yearly'
              ? t('upgrade.billing.plan.yearly')
              : t('upgrade.billing.plan.monthly')
          }
          value={
            profile?.planExpiresAt
              ? t('upgrade.billing.plan.renewsOn', {
                  date: formatBillingDate(profile.planExpiresAt, locale),
                })
              : undefined
          }
          mono
          accessory="none"
        />
        <UsageBlock
          usagePercent={usagePercent}
          usageUrgent={usagePercent > 80}
          profile={
            profile
              ? {
                  aiMessagesUsed: profile.aiMessagesUsed,
                  aiMessagesLimit: profile.aiMessagesLimit,
                }
              : null
          }
          t={t}
          tokens={tokens}
        />
        <View style={styles.actionPad}>
          <Pressable
            onPress={handleManagePlay}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
              },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: tokens.fgOnPrimary }]}>
              {t('upgrade.billing.actions.managePlay')}
            </Text>
          </Pressable>
          <Text style={[styles.centerMuted, { color: tokens.fg4 }]}>
            {t('upgrade.billing.actions.managePlayHint')}
          </Text>
        </View>
      </>
    )
  }

  function renderBillingDashboard(data: BillingDetails | null) {
    if (isBillingLoading) {
      return (
        <View style={styles.padBlock}>
          <ActivityIndicator size="small" color={tokens.primary} />
          <Text style={[styles.muted, { color: tokens.fg3 }]}>
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
          <AlertTriangle size={20} color={tokens.fg3} />
          <Text style={[styles.text, { color: tokens.fg2 }]}>
            {t('upgrade.billing.error')}
          </Text>
          <Pressable
            onPress={() => {
              refetchBilling().catch(() => {})
            }}
            style={styles.linkPress}
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
        <>
          <SectionLabel>{t('upgrade.billing.plan.title')}</SectionLabel>
          <SettingsRow
            label={
              profile?.isLifetimePro
                ? t('upgrade.billing.plan.lifetime')
                : t('upgrade.alreadyPro')
            }
            accessory="none"
          />
          <UsageBlock
            usagePercent={usagePercent}
            usageUrgent={usagePercent > 80}
            profile={
              profile
                ? {
                    aiMessagesUsed: profile.aiMessagesUsed,
                    aiMessagesLimit: profile.aiMessagesLimit,
                  }
                : null
            }
            t={t}
            tokens={tokens}
          />
        </>
      )
    }
    return (
      <>
        <SectionLabel>{t('upgrade.billing.plan.title')}</SectionLabel>
        <SettingsRow
          label={
            data.interval === 'yearly'
              ? t('upgrade.billing.plan.yearly')
              : t('upgrade.billing.plan.monthly')
          }
          value={
            data.cancelAtPeriodEnd
              ? t('upgrade.billing.plan.canceledHint', {
                  date: formatBillingDate(data.currentPeriodEnd, locale),
                })
              : t('upgrade.billing.plan.renewsOn', {
                  date: formatBillingDate(data.currentPeriodEnd, locale),
                })
          }
          mono
          accessory="none"
        />
        {data.cancelAtPeriodEnd ? (
          <View style={styles.italicBlock}>
            <Text style={[styles.italicText, { color: tokens.statusOverdue }]}>
              {t('upgrade.billing.plan.canceledBadge')}
            </Text>
          </View>
        ) : null}
        {data.status === 'past_due' && !data.cancelAtPeriodEnd ? (
          <View style={styles.italicBlock}>
            <Text style={[styles.italicText, { color: tokens.statusBad }]}>
              {t('upgrade.billing.plan.pastDue')}
            </Text>
          </View>
        ) : null}

        {data.paymentMethod ? (
          <>
            <SectionLabel>{t('upgrade.billing.payment.title')}</SectionLabel>
            <SettingsRow
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

        <UsageBlock
          usagePercent={usagePercent}
          usageUrgent={usagePercent > 80}
          profile={
            profile
              ? {
                  aiMessagesUsed: profile.aiMessagesUsed,
                  aiMessagesLimit: profile.aiMessagesLimit,
                }
              : null
          }
          t={t}
          tokens={tokens}
        />

        {data.recentInvoices.length > 0 ? (
          <>
            <SectionLabel>{t('upgrade.billing.invoices.title')}</SectionLabel>
            {data.recentInvoices.map((invoice) => {
              const state = invoiceStatusColors(invoice.status, tokens)
              const url = invoice.invoicePdf ?? invoice.hostedInvoiceUrl
              const dateLabel = formatBillingDate(invoice.date, locale)
              return (
                <View
                  key={invoice.id}
                  style={[
                    styles.invoiceRow,
                    { borderBottomColor: tokens.hairline },
                  ]}
                >
                  <View style={styles.invoiceMeta}>
                    <Text
                      style={[styles.invoiceDate, { color: tokens.fg1 }]}
                    >
                      {dateLabel}
                    </Text>
                    <Text
                      style={[styles.invoiceStatus, { color: state.text }]}
                    >
                      {(
                        {
                          paid: t('upgrade.billing.invoices.statusPaid'),
                          open: t('upgrade.billing.invoices.statusOpen'),
                          void: t('upgrade.billing.invoices.statusVoid'),
                        } as Record<string, string>
                      )[invoice.status] ?? invoice.status}
                    </Text>
                  </View>
                  <Text
                    style={[styles.invoiceAmount, { color: tokens.fg1 }]}
                  >
                    {formatPrice(invoice.amountPaid, invoice.currency)}
                  </Text>
                  {url ? (
                    <Pressable
                      onPress={() => {
                        Linking.openURL(url).catch(() => {})
                      }}
                      style={styles.linkPress}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'upgrade.billing.invoices.download',
                      )}
                    >
                      <Download size={14} color={tokens.fg3} />
                    </Pressable>
                  ) : null}
                </View>
              )
            })}
          </>
        ) : null}

        <View style={styles.actionPad}>
          <Pressable
            onPress={handlePortal}
            disabled={portalLoading || !isOnline}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: pressed
                  ? tokens.primaryPressed
                  : tokens.primary,
              },
              (portalLoading || !isOnline) && { opacity: 0.55 },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: tokens.fgOnPrimary }]}>
              {t('upgrade.billing.actions.manage')}
            </Text>
          </Pressable>
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

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback(fallbackRoute)}
        title={t('upgrade.title')}
        backLabel={t('common.goBack')}
      />

      {profile?.isTrialActive ? (
        <View
          style={[
            styles.edgeBanner,
            { borderBottomColor: tokens.hairline },
          ]}
        >
          <Clock
            size={13}
            color={trialUrgent ? tokens.statusOverdue : tokens.fg2}
            strokeWidth={1.7}
          />
          <Text
            style={[
              styles.bannerText,
              {
                color: trialUrgent ? tokens.statusOverdue : tokens.fg2,
              },
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

      {trialExpired ? (
        <View
          style={[
            styles.edgeBanner,
            { borderBottomColor: tokens.hairline },
          ]}
        >
          <Text
            style={[styles.bannerText, { color: tokens.statusOverdue }]}
          >
            {t('trial.expired.title')}
          </Text>
        </View>
      ) : null}

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

        {showBilling ? (
          isPlaySource ? renderPlayBillingDashboard() : renderBillingDashboard(billing)
        ) : (
          <>
            {trialExpired ? (
              <View style={styles.expiredBlock}>
                <View style={styles.expiredHeader}>
                  <Sparkles size={16} color={tokens.primary} />
                  <Text
                    style={[styles.expiredTitle, { color: tokens.fg1 }]}
                  >
                    {t('trial.expired.title')}
                  </Text>
                </View>
                <Text style={[styles.expiredSub, { color: tokens.fg3 }]}>
                  {t('trial.expired.dontLose')}
                </Text>
                <View style={styles.expiredList}>
                  {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
                    <View key={feature} style={styles.expiredFeatureRow}>
                      <CheckCircle2
                        size={14}
                        color={tokens.primary}
                        strokeWidth={1.7}
                      />
                      <Text
                        style={[styles.featureLabel, { color: tokens.fg2 }]}
                      >
                        {t(feature)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {isLoadingPlans ? (
              <View style={styles.padBlock}>
                <ActivityIndicator size="small" color={tokens.primary} />
                <Text style={[styles.muted, { color: tokens.fg3 }]}>
                  {t('common.loading')}
                </Text>
              </View>
            ) : null}

            {isPlansError && !plans && !isLoadingPlans ? (
              isOnline ? (
                <View style={styles.padBlock}>
                  <AlertTriangle size={20} color={tokens.fg3} />
                  <Text style={[styles.text, { color: tokens.fg2 }]}>
                    {t('upgrade.plans.error')}
                  </Text>
                  <Pressable
                    onPress={() => {
                      refetchPlans().catch(() => {})
                    }}
                    style={styles.linkPress}
                  >
                    <Text style={[styles.link, { color: tokens.fg1 }]}>
                      {t('upgrade.plans.retry')}
                    </Text>
                  </Pressable>
                </View>
              ) : null
            ) : null}

            {plans ? (
              <PlanCards
                plans={plans}
                hasProAccess={hasProAccess}
                checkoutLoading={checkoutLoading}
                onCheckout={handleCheckout}
                monthlyPrice={playBilling.monthlyOffer?.displayPrice}
                yearlyPrice={playBilling.yearlyOffer?.displayPrice}
                t={t}
                tokens={tokens}
              />
            ) : null}

            {plans ? (
              <View style={styles.actionPad}>
                {playBilling.isReferralPricing ? (
                  <Text
                    style={[styles.couponNote, { color: tokens.statusDone }]}
                  >
                    {t('upgrade.plans.coupon.appliedNote')}
                  </Text>
                ) : null}
                <Text style={[styles.equivalent, { color: tokens.fg3 }]}>
                  {t('upgrade.plans.equivalent', {
                    price: monthlyEquivalentPriceLabel(plans, playBilling.yearlyOffer),
                  })}
                </Text>
                <Pressable
                  onPress={() => handleCheckout('yearly')}
                  disabled={checkoutLoading !== null}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: pressed
                        ? tokens.primaryPressed
                        : tokens.primary,
                    },
                    checkoutLoading !== null && { opacity: 0.55 },
                  ]}
                >
                  {checkoutLoading === 'yearly' ? (
                    <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
                  ) : null}
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: tokens.fgOnPrimary },
                    ]}
                  >
                    {trialExpired
                      ? t('trial.expired.subscribe')
                      : t('upgrade.plans.yearly.cta')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void playBilling.restorePurchases()
                  }}
                  disabled={playBilling.isRestoring}
                  accessibilityRole="button"
                  style={styles.linkPress}
                >
                  {playBilling.isRestoring ? (
                    <ActivityIndicator size="small" color={tokens.fg3} />
                  ) : (
                    <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>
                      {t('upgrade.restorePurchase')}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {checkoutError ? (
              <View style={styles.padBlock}>
                <Text style={[styles.errorText, { color: tokens.statusBad }]}>
                  {checkoutError}
                </Text>
              </View>
            ) : null}

            <FeatureComparisonTable t={t} tokens={tokens} />
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  planRow: {
    marginHorizontal: 20,
    marginVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planLabel: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 15,
    },
  planPrice: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  planSub: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  currentBadgeText: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 9,
    letterSpacing: 0.54,
    textTransform: 'uppercase',
  },
  proFeaturesPad: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  proFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proFeatureText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    flexShrink: 1,
  },
  featureCategoryRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  featureCategoryLabel: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  featureLabelGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    flexShrink: 1,
  },
  featureCell: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCellText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  edgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  bannerText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    flex: 1,
  },
  usagePad: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  usageTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: 999,
  },
  expiredBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 10,
  },
  expiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expiredTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 17,
    letterSpacing: -0.17,
  },
  expiredSub: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontStyle: 'italic',
  },
  expiredList: { gap: 6 },
  expiredFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invoiceMeta: { flex: 1 },
  invoiceDate: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  invoiceStatus: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  invoiceAmount: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  actionPad: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    alignItems: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'stretch',
  },
  primaryBtnText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 14,
    },
  linkPress: { padding: 6 },
  link: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  restoreLink: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  italicBlock: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  italicText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
  },
  safe: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
  },
  padBlock: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  muted: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
  },
  centerMuted: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
  couponNote: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
  },
  equivalent: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})

function createStyles(_tokens: Tokens) {
  return styles
}
