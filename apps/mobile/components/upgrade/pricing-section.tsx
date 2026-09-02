import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import {
  AlertTriangle,
  BarChart3,
  Flame,
  MessageSquare,
  Palette,
  ShieldCheck,
  Tag,
} from '@/components/ui/icons'
import {
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
} from '@orbit/shared/utils/upgrade'
import type { UpgradeIconKey } from '@orbit/shared/utils/upgrade'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { plural } from '@/lib/plural'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanComparisonCards } from './plan-comparison-cards'
import { PlanSelection } from './plan-selection'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

const iconByKey: Record<UpgradeIconKey, typeof Flame> = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
}

const MARQUEE = [...UPGRADE_PRO_FEATURES, ...UPGRADE_YEARLY_EXTRA_FEATURES]

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 40)
    .reduceMotion(ReduceMotion.System)
}

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational section aggregator: each boolean is an independent upgrade-screen UI-state flag (plans loading/error, online, ...) owned by the upgrade screen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function PricingSection({
  profile,
  plans,
  isLoadingPlans,
  isPlansError,
  isOnline,
  trialDaysLeft,
  selectedInterval,
  onSelectInterval,
  onStayFree,
  yearlyOffer,
  monthlyDisplayPrice,
  yearlyDisplayPrice,
  isReferralPricing,
  isRestoring,
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
  trialDaysLeft: number | null
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  yearlyOffer: PlayOffer | null
  monthlyDisplayPrice?: string
  yearlyDisplayPrice?: string
  isReferralPricing: boolean
  isRestoring: boolean
  onRestore: () => void
  onRetryPlans: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const trialActive = !!profile?.isTrialActive
  const trialEyebrow =
    trialDaysLeft === null
      ? t('upgrade.convert.trialEyebrow')
      : trialDaysLeft === 0
      ? t('upgrade.convert.trialLastDay')
      : plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  const eyebrow = trialActive ? trialEyebrow : t('upgrade.convert.freeEyebrow')
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <>
      <Animated.View entering={sectionEntrance(0)}>
        <Text style={[styles.convertEyebrow, { color: tokens.primarySoft }]}>{eyebrow}</Text>
        <Text style={[styles.convertHeading, { color: tokens.fg1 }]}>{heading}</Text>
        <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t('upgrade.convert.promise')}</Text>
        {!trialActive ? (
          <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text>
        ) : null}
      </Animated.View>

      {isLoadingPlans ? (
        <View style={{ marginTop: 18 }}>
          {[0, 1].map((index) => (
            <Skeleton key={index} variant="stat-tile" label={t('common.loading')} />
          ))}
        </View>
      ) : null}

      {isPlansError && !plans && !isLoadingPlans && isOnline ? (
        <View style={styles.padBlock}>
          <AlertTriangle size={26} strokeWidth={1.8} color={tokens.fg3} />
          <Text style={[styles.noticeText, { color: tokens.fg2 }]}>{t('upgrade.plans.error')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetryPlans}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.actionChip,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev, borderColor: tokens.hairline },
              pressed ? styles.pressedScale : null,
            ]}
          >
            <Text style={[styles.link, { color: tokens.fg1 }]}>{t('upgrade.plans.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {plans ? (
        <>
          <Animated.View entering={sectionEntrance(1)}>
            <PlanSelection
              plans={plans}
              yearlyOffer={yearlyOffer}
              monthlyPrice={monthlyDisplayPrice}
              yearlyPrice={yearlyDisplayPrice}
              selectedInterval={selectedInterval}
              onSelectInterval={onSelectInterval}
              onStayFree={onStayFree}
              t={t}
              tokens={tokens}
            />
          </Animated.View>

          {isReferralPricing ? (
            <View style={[styles.couponRow, { alignSelf: 'center', marginTop: 2 }]}>
              <Tag size={13} strokeWidth={1.8} color={tokens.statusDone} />
              <Text style={[styles.couponNote, { color: tokens.statusDone }]}>
                {t('upgrade.plans.coupon.appliedNote')}
              </Text>
            </View>
          ) : null}

          <Animated.View style={styles.marqueePad} entering={sectionEntrance(2)}>
            {MARQUEE.map((feature) => {
              const Icon = iconByKey[feature.iconKey]
              return (
                <View key={feature.key} style={styles.marqueeRow}>
                  <View style={styles.marqueeIcon}>
                    <Icon size={20} strokeWidth={1.8} color={tokens.primary} />
                  </View>
                  <Text style={[styles.marqueeText, { color: tokens.fg1 }]}>
                    {t(`upgrade.plans.proFeatures.${feature.key}`)}
                  </Text>
                  {feature.key === 'retrospective' ? (
                    <Badge >{t('upgrade.matrix.yearlyTag')}</Badge>
                  ) : null}
                </View>
              )
            })}
          </Animated.View>

          <PlanComparisonCards t={t} tokens={tokens} />

          <Pressable
            accessibilityRole="button"
            onPress={onRestore}
            disabled={isRestoring || !isOnline}
            accessibilityState={{ disabled: isRestoring || !isOnline }}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.actionChip,
              { alignSelf: 'center', marginTop: 20, backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev, borderColor: tokens.hairline },
              pressed ? styles.pressedScale : null,
            ]}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={tokens.fg3} />
            ) : (
              <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>{t('upgrade.restorePurchase')}</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </>
  )
}
