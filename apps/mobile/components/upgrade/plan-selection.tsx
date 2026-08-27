import { Pressable, Text, View } from 'react-native'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanCard } from '@/components/upgrade/plan-card'
import { Badge } from '@/components/ui/badge'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { styles } from './styles'
import { monthlyEquivalentPriceLabel } from './types'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

export function PlanSelection({
  plans,
  yearlyOffer,
  monthlyPrice,
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
  const monthlyCharge =
    monthlyPrice ??
    formatPrice(applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff), plans.currency)

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('upgrade.plan')} style={styles.planGroup}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={<Badge>{t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}</Badge>}
        price={t('upgrade.plans.equivalent', {
          price: monthlyEquivalentPriceLabel(plans, yearlyOffer),
        })}
        selected={selectedInterval === 'yearly'}
        onClick={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${monthlyCharge}${t('upgrade.plans.monthly.period')}`}
        selected={selectedInterval === 'monthly'}
        onClick={() => onSelectInterval('monthly')}
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
