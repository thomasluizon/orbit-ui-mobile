import { ProPitch } from './pro-pitch'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { PlanSelection } from './plan-selection'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational section aggregator: each boolean is an independent upgrade-screen UI-state flag (plans loading/error, online, ...) owned by the upgrade screen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function PricingSection({
  inset = true,
  focusOnMount = false,
  profile,
  plans,
  isLoadingPlans,
  isPlansError,
  isOnline,
  trialDaysLeft,
  selectedInterval,
  onSelectInterval,
  onStayFree,
  monthlyOffer,
  yearlyOffer,
  monthlyDisplayPrice,
  yearlyDisplayPrice,
  checkoutLoading,
  checkoutError,
  checkoutDisabled,
  onCheckout,
  isRestoring,
  onRestore,
  onRetryPlans,
  t,
  tokens,
}: Readonly<{
  inset?: boolean
  focusOnMount?: boolean
  profile: { isTrialActive?: boolean } | null
  plans: SubscriptionPlans | null | undefined
  isLoadingPlans: boolean
  isPlansError: boolean
  isOnline: boolean
  trialDaysLeft: number | null
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  monthlyOffer: PlayOffer | null
  yearlyOffer: PlayOffer | null
  monthlyDisplayPrice?: string
  yearlyDisplayPrice?: string
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  checkoutDisabled: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  isRestoring: boolean
  onRestore: () => void
  onRetryPlans: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View style={styles.pricingSections}>
      <ProPitch inset={inset} profile={profile} trialDaysLeft={trialDaysLeft} t={t} focusOnMount={focusOnMount} tokens={tokens} />

      <View style={styles.purchaseGroup}>
        <View style={styles.purchaseActions}>
          <PlanSelection
            inset={inset}
            plans={plans}
            isLoading={isLoadingPlans}
            isError={isPlansError}
            isOnline={isOnline}
            monthlyOffer={monthlyOffer}
            yearlyOffer={yearlyOffer}
            monthlyPrice={monthlyDisplayPrice}
            yearlyPrice={yearlyDisplayPrice}
            selectedInterval={selectedInterval}
            checkoutLoading={checkoutLoading}
            checkoutError={checkoutError}
            checkoutDisabled={checkoutDisabled}
            onSelectInterval={onSelectInterval}
            onCheckout={onCheckout}
            onRetry={onRetryPlans}
            t={t}
            tokens={tokens}
          />
          {plans ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRestore}
              disabled={isRestoring || !isOnline || checkoutLoading !== null}
              accessibilityState={{ disabled: isRestoring || !isOnline || checkoutLoading !== null, busy: isRestoring }}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [
                styles.restoreAction,
                { flexDirection: 'row', alignItems: 'center', gap: 8 },
                isRestoring || !isOnline || checkoutLoading !== null ? styles.disabledAction : null,
                pressed ? styles.pressedScale : null,
              ]}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={tokens.fg3} />
              ) : null}
              <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>{t('upgrade.restorePurchase')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.reassurance, !inset && { paddingHorizontal: 0 }]}>
          {plans ? <View style={styles.reassuranceCopy}>
              <Text style={[styles.reassurancePrimary, { color: tokens.fg2 }]}>
                {t('upgrade.convert.cancelAnytime')}
              </Text>
              <Text style={[styles.renewalNote, { color: tokens.fg3 }]}>
                {t('upgrade.plans.renewalNote')}
              </Text>
              <Text style={[styles.handoffNote, { color: tokens.fg3 }]}>
                {t('upgrade.convert.handOff')}
              </Text>
            </View> : null}
            <Pressable
              accessibilityRole="link"
              onPress={onStayFree}
              disabled={checkoutLoading !== null}
              accessibilityState={{ disabled: checkoutLoading !== null }}
              style={({ pressed }) => [
                styles.freeLink,
                checkoutLoading !== null ? styles.disabledAction : null,
                pressed ? styles.pressedScale : null,
              ]}
            >
              <Text style={[styles.freeLinkText, { color: tokens.fg1 }]}>
                {t('upgrade.convert.stayFree')}
              </Text>
            </Pressable>
          </View>
      </View>
    </View>
  )
}
