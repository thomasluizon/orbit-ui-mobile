import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Text, View, useWindowDimensions } from 'react-native'
import { responsiveTypeStyle } from '@/lib/theme'
import { plural } from '@/lib/plural'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'
export function ProPitch({ inset = true, profile, trialDaysLeft, t, focusOnMount = false, titleKey, bodyKey, headingId, dateHint, tokens }: Readonly<{ inset?: boolean; profile: { isTrialActive?: boolean } | null; trialDaysLeft: number | null; t: UpgradeTextFn; tokens: Tokens; focusOnMount?: boolean; titleKey?: string; bodyKey?: string; headingId?: string; dateHint?: string }>) {
  const headingRef = useRef<Text>(null)
  useEffect(() => {
    if (focusOnMount && headingRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus')
    }
  }, [focusOnMount])
  const trialActive = !!profile?.isTrialActive
  const { width } = useWindowDimensions()
  const trialEyebrow =
    trialDaysLeft === null
      ? t('upgrade.convert.trialEyebrow')
      : trialDaysLeft <= 1
      ? t('upgrade.convert.trialLastDay')
      : plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  const eyebrow = trialActive ? trialEyebrow : t('upgrade.convert.freeEyebrow')
  const heading = titleKey ? t(titleKey) : trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (<View style={styles.pricingSections}>
      <View style={[styles.convertHeader, !inset && { paddingHorizontal: 0 }]}>
        <Text style={[styles.convertEyebrow, { color: tokens.fg3 }]}>{eyebrow}</Text>
        <Text nativeID={headingId} ref={headingRef} accessibilityRole="header" style={[responsiveTypeStyle('displayHeading', width), { color: tokens.fg1 }]}>{heading}</Text>
        <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t(bodyKey ?? 'upgrade.convert.promise')}</Text>
        {!trialActive ? (
          <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text>
        ) : null}
        {dateHint ? <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{dateHint}</Text> : null}
      </View>

      <View style={[styles.allowanceSection, !inset && { paddingHorizontal: 0 }]}>
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



  </View>)
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
