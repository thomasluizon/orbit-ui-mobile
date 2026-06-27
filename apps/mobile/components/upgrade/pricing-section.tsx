import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import {
  AlertTriangle,
  BarChart3,
  Flame,
  MessageSquare,
  Palette,
  ShieldCheck,
  Tag,
} from 'lucide-react-native'
import {
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
} from '@orbit/shared/utils/upgrade'
import type { UpgradeIconKey } from '@orbit/shared/utils/upgrade'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { plural } from '@/lib/plural'
import { Badge } from '@/components/ui/badge'
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
  const eyebrow = trialActive
    ? trialDaysLeft === 0
      ? t('upgrade.convert.trialLastDay')
      : plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)
    : t('upgrade.convert.freeEyebrow')
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <>
      <Text style={[styles.convertEyebrow, { color: tokens.primarySoft }]}>{eyebrow}</Text>
      <Text style={[styles.convertHeading, { color: tokens.fg1 }]}>{heading}</Text>
      <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t('upgrade.convert.promise')}</Text>
      {!trialActive ? (
        <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text>
      ) : null}

      {isLoadingPlans ? (
        <View style={styles.padBlock}>
          <ActivityIndicator size="small" color={tokens.primary} />
          <Text style={[styles.mutedMeta, { color: tokens.fg3 }]}>{t('common.loading')}</Text>
        </View>
      ) : null}

      {isPlansError && !plans && !isLoadingPlans && isOnline ? (
        <View style={styles.padBlock}>
          <AlertTriangle size={26} strokeWidth={1.8} color={tokens.fg3} />
          <Text style={[styles.noticeText, { color: tokens.fg2 }]}>{t('upgrade.plans.error')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetryPlans}
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

          {isReferralPricing ? (
            <View style={[styles.couponRow, { alignSelf: 'center', marginTop: 2 }]}>
              <Tag size={13} strokeWidth={1.8} color={tokens.statusDone} />
              <Text style={[styles.couponNote, { color: tokens.statusDone }]}>
                {t('upgrade.plans.coupon.appliedNote')}
              </Text>
            </View>
          ) : null}

          <View style={styles.marqueePad}>
            {MARQUEE.map((feature) => {
              const Icon = iconByKey[feature.iconKey]
              return (
                <View key={feature.key} style={styles.marqueeRow}>
                  <View style={styles.marqueeIcon}>
                    <Icon size={20} strokeWidth={1.8} color={tokens.primarySoft} />
                  </View>
                  <Text style={[styles.marqueeText, { color: tokens.fg1 }]}>
                    {t(`upgrade.plans.proFeatures.${feature.key}`)}
                  </Text>
                  {feature.key === 'retrospective' ? (
                    <Badge tone="soft">{t('upgrade.matrix.yearlyTag')}</Badge>
                  ) : null}
                </View>
              )
            })}
          </View>

          <PlanComparisonCards t={t} tokens={tokens} />

          <Pressable
            accessibilityRole="button"
            onPress={onRestore}
            disabled={isRestoring}
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
