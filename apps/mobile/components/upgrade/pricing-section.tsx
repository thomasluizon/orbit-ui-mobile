import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { responsiveTypeStyle } from '@/lib/theme'
import { Calendar, Eye, FileText } from '@/components/ui/icons'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { plural } from '@/lib/plural'
import { PlanSelection } from './plan-selection'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

const OUTCOMES = [
  { key: 'calendar', Icon: Calendar },
  { key: 'retrospective', Icon: FileText },
  { key: 'noticing', Icon: Eye },
] as const

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
  const trialActive = !!profile?.isTrialActive
  const { width } = useWindowDimensions()
  const trialEyebrow =
    trialDaysLeft === null
      ? t('upgrade.convert.trialEyebrow')
      : trialDaysLeft <= 1
      ? t('upgrade.convert.trialLastDay')
      : plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  const eyebrow = trialActive ? trialEyebrow : t('upgrade.convert.freeEyebrow')
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <View style={styles.pricingSections}>
      <View style={styles.convertHeader}>
        <Text style={[styles.convertEyebrow, { color: tokens.fg3 }]}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={[responsiveTypeStyle('displayHeading', width), { color: tokens.fg1 }]}>{heading}</Text>
        <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t('upgrade.convert.promise')}</Text>
        {!trialActive ? (
          <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text>
        ) : null}
      </View>

      <View style={styles.allowanceSection}>
        <View
          style={[
            styles.allowanceCard,
            { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
          ]}
        >
          <Allowance amount={t('upgrade.convert.freeAllowance')} label={t('upgrade.free')} perDay={t('upgrade.convert.perDay')} color={tokens.fg1} mutedColor={tokens.fg3} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.allowanceDivider, { backgroundColor: tokens.hairline }]} />
          <Allowance amount={t('upgrade.convert.proAllowance')} label="Pro" perDay={t('upgrade.convert.perDay')} color={tokens.fg1} mutedColor={tokens.fg3} />
        </View>
        <Text style={[styles.allowanceNote, { color: tokens.fg3 }]}>{t('upgrade.convert.allowanceNote')}</Text>
      </View>

      <View accessible accessibilityLabel={t('upgrade.outcomes.label')} style={styles.outcomes}>
        {OUTCOMES.map(({ key, Icon }) => (
          <View key={key} style={styles.outcomeRow}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.outcomeIcon}
            >
              <Icon size={20} strokeWidth={1.8} color={tokens.fg3} />
            </View>
            <View style={styles.outcomeCopy}>
              <Text accessibilityRole="header" style={[styles.outcomeTitle, { color: tokens.fg1 }]}>
                {t(`upgrade.outcomes.${key}.title`)}
              </Text>
              <Text style={[styles.outcomeBody, { color: tokens.fg3 }]}>
                {t(`upgrade.outcomes.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.purchaseGroup}>
        <View style={styles.purchaseActions}>
          <PlanSelection
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
              disabled={isRestoring || !isOnline}
              accessibilityState={{ disabled: isRestoring || !isOnline }}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [
                styles.restoreAction,
                isRestoring || !isOnline ? styles.disabledAction : null,
                pressed ? styles.pressedScale : null,
              ]}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={tokens.fg3} />
              ) : (
                <Text style={[styles.restoreLink, { color: tokens.fg3 }]}>{t('upgrade.restorePurchase')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {plans ? (
          <View style={styles.reassurance}>
            <View style={styles.reassuranceCopy}>
              <Text style={[styles.reassurancePrimary, { color: tokens.fg2 }]}>
                {t('upgrade.convert.cancelAnytime')}
              </Text>
              <Text style={[styles.renewalNote, { color: tokens.fg3 }]}>
                {t('upgrade.plans.renewalNote')}
              </Text>
              <Text style={[styles.handoffNote, { color: tokens.fg3 }]}>
                {t('upgrade.convert.handOff')}
              </Text>
            </View>
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
        ) : null}
      </View>
    </View>
  )
}

function Allowance({
  amount,
  label,
  perDay,
  color,
  mutedColor,
}: Readonly<{
  amount: string
  label: string
  perDay: string
  color: string
  mutedColor: string
}>) {
  const { width } = useWindowDimensions()
  return (
    <View style={styles.allowanceColumn}>
      <Text style={[styles.allowanceLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[responsiveTypeStyle('allowance', width), { color }]}>{amount}</Text>
      <Text style={[styles.allowancePerDay, { color: mutedColor }]}>{perDay}</Text>
    </View>
  )
}
