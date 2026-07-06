import { useEffect, useMemo } from 'react'
import { Animated, Text, View } from 'react-native'
import { AppLogo } from '@/components/ui/app-logo'
import { easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import type { LoginStyles } from './login-styles'

type LoginStep = 'email' | 'code'
type TranslationFn = (key: string, params?: Record<string, unknown>) => string

function useEntrance(
  duration: number,
  prefersReducedMotion: boolean,
): Animated.Value {
  const progress = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      progress.setValue(1)
      return
    }
    progress.setValue(0)
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [duration, prefersReducedMotion, progress])

  return progress
}

interface LoginHeaderProps {
  step: LoginStep
  t: TranslationFn
  styles: LoginStyles
  fromOnboarding?: boolean
  plannedHabitCount?: number
}

export function LoginHeader({
  step,
  t,
  styles,
  fromOnboarding = false,
  plannedHabitCount = 0,
}: Readonly<LoginHeaderProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const logoEntrance = useEntrance(280, prefersReducedMotion)
  const showPlanSummary = fromOnboarding && step === 'email'

  const title = showPlanSummary
    ? t('onboarding.flow.saveYourPlan.title')
    : step === 'email'
      ? t('auth.signIn')
      : t('auth.enterCode')

  return (
    <>
      <View style={styles.brandingHeader}>
        <Animated.View
          style={{
            opacity: logoEntrance,
            transform: [
              {
                scale: logoEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
                }),
              },
            ],
          }}
        >
          <AppLogo size={64} />
        </Animated.View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.stepTitle} accessibilityRole="header">
          {title}
        </Text>
        {showPlanSummary ? (
          <>
            <Text style={styles.stepSubtitle}>
              {t('onboarding.flow.saveYourPlan.subtitle')}
            </Text>
            {plannedHabitCount > 0 && (
              <Text style={styles.stepSubtitle}>
                {plannedHabitCount === 1
                  ? t('onboarding.flow.saveYourPlan.habitSummaryOne')
                  : t('onboarding.flow.saveYourPlan.habitSummary', {
                      count: plannedHabitCount,
                    })}
              </Text>
            )}
          </>
        ) : (
          step === 'email' && (
            <Text style={styles.stepSubtitle}>{t('auth.signInSubtitle')}</Text>
          )
        )}
      </View>
    </>
  )
}

interface ReferralBannerProps {
  t: TranslationFn
  styles: LoginStyles
}

export function ReferralBanner({ t, styles }: Readonly<ReferralBannerProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const entrance = useEntrance(220, prefersReducedMotion)

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.referralBanner,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.referralBannerText}>{t('referral.loginBanner')}</Text>
    </Animated.View>
  )
}

interface LoginSuccessMessageProps {
  message: string
  styles: LoginStyles
}

export function LoginSuccessMessage({
  message,
  styles,
}: Readonly<LoginSuccessMessageProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const entrance = useEntrance(220, prefersReducedMotion)

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            }),
          },
        ],
      }}
    >
      <Text style={styles.successText} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </Animated.View>
  )
}
