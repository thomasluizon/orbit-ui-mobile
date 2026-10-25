import { useRouter } from 'expo-router'
import { SPACING } from '@orbit/shared/theme'
import { ProPitch } from './pro-pitch'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { StoreOffer } from '@/hooks/use-play-billing'
import { PlanSelection } from './plan-selection'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational section aggregator: each boolean is an independent upgrade-screen UI-state flag (plans loading/error, online, ...) owned by the upgrade screen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function PricingSection({
  inset = true,
  focusOnMount = false,
  dateHint,
  profile,
  plans,
  isLoadingPlans,
  isPlansError,
  isLoadingProducts = false,
  isProductsError = false,
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
  dateHint?: string
  focusOnMount?: boolean
  profile: { isTrialActive?: boolean } | null
  plans: SubscriptionPlans | null | undefined
  isLoadingPlans: boolean
  isPlansError: boolean
  isLoadingProducts?: boolean
  isProductsError?: boolean
  isOnline: boolean
  trialDaysLeft: number | null
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  monthlyOffer: StoreOffer | null
  yearlyOffer: StoreOffer | null
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
  const router = useRouter()
  return (
    <View style={styles.pricingSections}>
      <ProPitch dateHint={dateHint} inset={inset} profile={profile} trialDaysLeft={trialDaysLeft} t={t} focusOnMount={focusOnMount} tokens={tokens} />

      <View style={styles.purchaseGroup}>
        <View style={styles.purchaseActions}>
          <PlanSelection
            inset={inset}
            plans={isProductsError ? null : plans}
            isLoading={(Platform.OS !== 'ios' && isLoadingPlans) || isLoadingProducts}
            isError={(Platform.OS !== 'ios' && isPlansError) || isProductsError}
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
          {plans || Platform.OS === 'ios' ? (
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

        <View style={[styles.reassurance, !inset && { paddingHorizontal: SPACING.s0 }]}>
          {plans || Platform.OS === 'ios' ? <View style={styles.reassuranceCopy}>
              <Text style={[styles.reassurancePrimary, { color: tokens.fg2 }]}>
                {t('upgrade.convert.cancelAnytime')}
              </Text>
              <Text style={[styles.renewalNote, { color: tokens.fg3 }]}>
                {t(Platform.OS === 'ios' ? 'upgrade.appStore.autoRenewal' : 'upgrade.plans.renewalNote')}
              </Text>
              <Text style={[styles.handoffNote, { color: tokens.fg3 }]}>
                {t(Platform.OS === 'ios' ? 'upgrade.appStore.paymentNote' : 'upgrade.convert.handOff')}
              </Text>
              {Platform.OS === 'ios' ? <View style={{ gap: 8 }}>
                <Pressable accessibilityRole="link" onPress={() => router.push('/terms')}>
                  <Text style={[styles.restoreLink, { color: tokens.fg2 }]}>{t('terms.title')}</Text>
                </Pressable>
                <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')}>
                  <Text style={[styles.restoreLink, { color: tokens.fg2 }]}>{t('privacy.title')}</Text>
                </Pressable>
              </View> : null}
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
