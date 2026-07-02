import { Pressable, Text, View } from 'react-native'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanCard } from '@/components/upgrade/plan-card'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { styles } from './styles'
import { monthlyEquivalentPriceLabel } from './types'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

export function PlanSelection({
  plans,
  yearlyOffer,
  monthlyPrice,
  yearlyPrice,
  selectedInterval,
  onSelectInterval,
  onStayFree,
  t,
  tokens,
}: Readonly<{
  plans: SubscriptionPlans
  yearlyOffer: PlayOffer | null
  monthlyPrice?: string
  yearlyPrice?: string
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const yearlyCharge =
    yearlyPrice ??
    formatPrice(applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff), plans.currency)
  const monthlyCharge =
    monthlyPrice ??
    formatPrice(applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff), plans.currency)
  const discountSuffix =
    !yearlyPrice && plans.couponPercentOff
      ? ` · ${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
      : ''

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('upgrade.plan')} style={styles.planGroup}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={t('upgrade.plans.equivalent', {
          price: monthlyEquivalentPriceLabel(plans, yearlyOffer),
        })}
        sub={`${yearlyCharge}${t('upgrade.plans.yearly.period')}${discountSuffix}`}
        selected={selectedInterval === 'yearly'}
        onSelect={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${monthlyCharge}${t('upgrade.plans.monthly.period')}`}
        sub={t('upgrade.plans.monthly.note')}
        selected={selectedInterval === 'monthly'}
        onSelect={() => onSelectInterval('monthly')}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onStayFree}
        style={({ pressed }) => [
          styles.freeLink,
          pressed ? { opacity: 0.7, transform: [{ scale: 0.96 }] } : null,
        ]}
      >
        <Text style={[styles.freeLinkText, { color: tokens.fg3 }]}>{t('upgrade.convert.stayFree')}</Text>
      </Pressable>
    </View>
  )
}
