import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  Clock,
  Sparkles,
  Tag,
} from 'lucide-react-native'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { plural } from '@/lib/plural'
import { tintFromPrimary } from '@/lib/theme'
import { PlanComparisonCards } from './plan-comparison-cards'
import { PlanSelection } from './plan-selection'
import { TrialExpiredCard } from './trial-expired-card'
import { PillButton } from '@/components/ui/pill-button'
import { styles } from './styles'
import { rgbaFromHex } from './types'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

export function PricingSection({
  profile,
  plans,
  isLoadingPlans,
  isPlansError,
  isOnline,
  trialExpired,
  trialDaysLeft,
  trialUrgent,
  selectedInterval,
  onSelectInterval,
  checkoutLoading,
  checkoutError,
  yearlyOffer,
  monthlyDisplayPrice,
  yearlyDisplayPrice,
  isReferralPricing,
  isRestoring,
  onCheckout,
  onRestore,
  onRetryPlans,
  t,
  tokens,
}: Readonly<{
  profile: { isTrialActive?: boolean } | null
  plans: SubscriptionPlans | null | undefined
  isLoadingPlans: boolean
  isPlansError: boolean
  isOnline: boolean
  trialExpired: boolean
  trialDaysLeft: number | null
  trialUrgent: boolean
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  yearlyOffer: PlayOffer | null
  monthlyDisplayPrice?: string
  yearlyDisplayPrice?: string
  isReferralPricing: boolean
  isRestoring: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  onRestore: () => void
  onRetryPlans: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
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
            accessibilityRole="button"
            onPress={onRetryPlans}
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
            yearlyOffer={yearlyOffer}
            monthlyPrice={monthlyDisplayPrice}
            yearlyPrice={yearlyDisplayPrice}
            selectedInterval={selectedInterval}
            onSelectInterval={onSelectInterval}
            t={t}
          />

          <View style={styles.actionPad}>
            {isReferralPricing ? (
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
              onPress={() => onCheckout(selectedInterval)}
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
              onPress={onRestore}
              disabled={isRestoring}
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
              {isRestoring ? (
                <ActivityIndicator size="small" color={tokens.fg3} />
              ) : (
                <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>
                  {t('upgrade.restorePurchase')}
                </Text>
              )}
            </Pressable>
            <Text style={[styles.renewalNote, { color: tokens.fg3 }]}>
              {t('upgrade.plans.renewalNote')}
            </Text>
          </View>
        </>
      ) : null}

      <PlanComparisonCards t={t} tokens={tokens} />
    </>
  )
}
