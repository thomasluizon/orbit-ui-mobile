import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { WifiOff } from '@/components/ui/icons'
import type { AppTokensV2 } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
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
    <WifiOff size={20} color={tokens.fg3} accessible={false} />
    <Text style={styles.offlineText}>{t('auth.errors.offline')}</Text>
  </View>
}

/** WHY Reanimated: a native-driver Animated fade leaves its JS copy at 0, and on iOS Fabric a re-render plus a resize writes that 0 back to the layer after the fade (RCTViewComponentView.mm invalidateLayer), so the step stayed blank. Reanimated's commit hook puts the live value into every React commit. */
export function LoginStepStage({ step, children }: Readonly<{ step: string; children: ReactNode }>) {
  const motionPreset = useResolvedMotionPreset('route-replace')
  const reduced = motionPreset.reducedMotionEnabled
  const previousStep = useRef(step)
  const progress = useSharedValue(1)
  const shift = motionPreset.shift * (step === 'email' ? -1 : 1)
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: (1 - progress.value) * shift }] }))
  useLayoutEffect(() => {
    if (previousStep.current === step || reduced) { progress.value = 1; previousStep.current = step; return }
    previousStep.current = step
    progress.value = 0
    progress.value = withTiming(1, { duration: motionPreset.enterDuration, easing: Easing.bezier(...motionPreset.enterEasing) })
  }, [progress, reduced, step, motionPreset.enterDuration, motionPreset.enterEasing])
  return <Animated.View style={style}>{children}</Animated.View>
}


export function LoginValidationMessage({ message, isOnline, styles }: Readonly<{ message?: string; isOnline: boolean; styles: LoginStyles }>) {
  const visibleMessage = isOnline ? message : undefined
  return <View accessibilityLiveRegion="polite" style={visibleMessage ? undefined : styles.hiddenLiveRegion}>
    {visibleMessage ? <Text style={styles.error}>{visibleMessage}</Text> : null}
  </View>
}
