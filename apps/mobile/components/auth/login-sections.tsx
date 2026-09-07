import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Animated, Text, View } from 'react-native'
import { WifiOff } from '@/components/ui/icons'
import { easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import type { LoginStyles } from '@/app/login-styles'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function LoginHeader({ step, t, styles, fromOnboarding = false, plannedHabitCount = 0 }: Readonly<{
  step: 'email' | 'code'; t: Translate; styles: LoginStyles; fromOnboarding?: boolean; plannedHabitCount?: number
}>) {
  const onboarding = fromOnboarding && step === 'email'
  const title = onboarding ? t('auth.onboarding.title') : t(step === 'email' ? 'auth.emailTitle' : 'auth.enterCode')
  return <View style={styles.titleBlock}>
    <Text style={styles.stepTitle} accessibilityRole="header">{title}</Text>
    {onboarding && <>
      <Text style={styles.stepSubtitle}>{t('auth.onboarding.subtitle')}</Text>
      <Text style={styles.mono}>{plannedHabitCount === 1 ? t('auth.onboarding.habitOne') : t('auth.onboarding.habits', { count: plannedHabitCount })}</Text>
    </>}
  </View>
}

export function ReferralBanner({ t, styles }: Readonly<{ t: Translate; styles: LoginStyles }>) {
  return <View accessibilityLiveRegion="polite" style={styles.referralBanner}>
    <View style={styles.hairline} />
    <Text style={styles.referralBannerText}>{t('referral.loginBanner')}</Text>
    <View style={styles.hairline} />
  </View>
}

export function LoginSuccessMessage({ message, styles }: Readonly<{ message: string | null; styles: LoginStyles }>) {
  return <Text style={styles.successText} accessibilityLiveRegion="polite">{message}</Text>
}

export function LoginOfflineNotice({ t, styles, tokens }: Readonly<{ t: Translate; styles: LoginStyles; tokens: AppTokensV2 }>) {
  return <View style={styles.offlineNotice} accessibilityLiveRegion="polite" testID="offline-notice">
    <WifiOff size={20} color={tokens.fg4} accessible={false} />
    <Text style={styles.offlineText}>{t('auth.errors.offline')}</Text>
  </View>
}

export function LoginStepStage({ step, children }: Readonly<{ step: string; children: ReactNode }>) {
  const reduced = usePrefersReducedMotion()
  const previousStep = useRef(step)
  const progress = useMemo(() => new Animated.Value(1), [])
  useEffect(() => {
    if (previousStep.current === step || reduced) { progress.setValue(1); previousStep.current = step; return }
    previousStep.current = step
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: 220,
      easing: toAnimatedEasing(easings.smooth), useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [progress, reduced, step])
  return <Animated.View style={{ opacity: progress, transform: [{ translateX: progress.interpolate({
    inputRange: [0, 1], outputRange: [step === 'email' ? -12 : 12, 0],
  }) }] }}>{children}</Animated.View>
}
