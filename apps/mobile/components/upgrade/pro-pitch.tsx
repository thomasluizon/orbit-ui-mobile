import { useTranslation } from 'react-i18next'
import { createAstraAllowanceTranslator, type AstraAllowance } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Text, View, useWindowDimensions } from 'react-native'
import { responsiveTypeStyle } from '@/lib/theme'
import { plural } from '@/lib/plural'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'
export function ProPitch({ inset = true, profile, trialDaysLeft, t, focusOnMount = false, titleKey, bodyKey, headingId, dateHint, tokens }: Readonly<{ inset?: boolean; profile: ({ isTrialActive?: boolean } & AstraAllowance) | null; trialDaysLeft: number | null; t: UpgradeTextFn; tokens: Tokens; focusOnMount?: boolean; titleKey?: string; bodyKey?: string; headingId?: string; dateHint?: string }>) {
  const headingRef = useRef<Text>(null)
  useEffect(() => {
    if (focusOnMount && headingRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus')
    }
  }, [focusOnMount])
  const trialActive = !!profile?.isTrialActive
  const { width } = useWindowDimensions()
  const eyebrow = planFactLine(profile, trialDaysLeft, t)
  const heading = titleKey ? t(titleKey) : trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (<View style={styles.pricingSections}>
      <View style={[styles.convertHeader, !inset && { paddingHorizontal: SPACING.s0 }]}>
        <Text style={[styles.convertEyebrow, { color: tokens.fg3 }]}>{eyebrow}</Text>
        <Text nativeID={headingId} ref={headingRef} accessibilityRole="header" style={[responsiveTypeStyle('displayHeading', width), { color: tokens.fg1 }]}>{heading}</Text>
        <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t(bodyKey ?? 'upgrade.convert.promise')}</Text>
        {!trialActive ? (
          <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text>
        ) : null}
        {dateHint ? <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{dateHint}</Text> : null}
      </View>

      <AllowanceComparison inset={inset} profile={profile} t={t} tokens={tokens} />



  </View>)
}

/** The plan fact of the person: the free plan, or the trial with its days left. */
export function planFactLine(profile: { isTrialActive?: boolean } | null, trialDaysLeft: number | null, t: UpgradeTextFn): string {
  if (!profile?.isTrialActive) return t('upgrade.convert.freeEyebrow')
  if (trialDaysLeft === null) return t('upgrade.convert.trialEyebrow')
  if (trialDaysLeft <= 1) return t('upgrade.convert.trialLastDay')
  return plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
}

/** The allowance comparison: free a day beside Pro a week, its note and the weekly renewal line. */
export function AllowanceComparison({ inset = true, profile, t, tokens }: Readonly<{ inset?: boolean; profile: AstraAllowance | null; t: UpgradeTextFn; tokens: Tokens }>) {
  const { i18n } = useTranslation()
  const allowanceText = createAstraAllowanceTranslator(t, profile, i18n.language)
  return (
    <View accessibilityLabel={t('upgrade.convert.allowanceLabel')} style={[styles.allowanceSection, !inset && { paddingHorizontal: SPACING.s0 }]}>
      <View
        style={[
          styles.allowanceCard,
          { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
        ]}
      >
        <Allowance amount={t('upgrade.convert.freeAllowance')} label={t('upgrade.free')} perDay={t('upgrade.convert.perDay')} color={tokens.fg1} mutedColor={tokens.fg3} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.allowanceDivider, { backgroundColor: tokens.hairline }]} />
        <Allowance amount={t('upgrade.convert.proAllowance')} label="Pro" perDay={t('upgrade.convert.perWeek')} color={tokens.fg1} mutedColor={tokens.fg3} />
      </View>
      <Text style={[styles.allowanceNote, { color: tokens.fg3 }]}>{t('upgrade.convert.allowanceNote')}</Text>
      {profile?.aiMessagesPeriod === 'week' ? <Text style={[styles.allowanceNote, { color: tokens.fg3 }]}>{allowanceText('shell.composer.limit.renewal')}</Text> : null}
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
