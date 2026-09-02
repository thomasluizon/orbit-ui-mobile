import { useEffect, useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ONBOARDING_WEEK_START_OPTIONS } from '@orbit/shared/utils/onboarding'
import type { OnboardingWeekStartDay } from '@orbit/shared/stores'
import { useProfile } from '@/hooks/use-profile'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { Chip } from '@/components/ui/chip'
import { AppLogo } from '@/components/ui/app-logo'
import { useOnboardingActions } from './onboarding-actions-context'

/**
 * ob-1 Welcome step: tinted hero disc + logo and week-start chips. Writes the
 * selection through the onboarding action provider in both onboarding modes.
 */
export function OnboardingWelcome() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const actions = useOnboardingActions()
  const draftWeekStartDay = useOnboardingDraftStore((s) => s.weekStartDay)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const heroScale = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      heroScale.setValue(1)
      return
    }
    const animation = Animated.spring(heroScale, {
      toValue: 1,
      stiffness: 220,
      damping: 22,
      mass: 1,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [heroScale, prefersReducedMotion])

  function handleWeekStartDaySelect(day: OnboardingWeekStartDay) {
    void actions.setWeekStartDay(day)
  }

  const weekStartDay = profile?.weekStartDay ?? draftWeekStartDay ?? 1

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.heroDisc,
          {
            opacity: heroScale,
            transform: [
              {
                scale: heroScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
          },
        ]}
      >
        <AppLogo size={56} />
      </Animated.View>

      <Text style={styles.title}>{t('onboarding.flow.welcome.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.welcome.subtitle')}
      </Text>

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.welcome.weekStart')}
      </Text>
      <View style={styles.chipsRow}>
        {ONBOARDING_WEEK_START_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={weekStartDay === option.value}
            onPress={() => handleWeekStartDaySelect(option.value)}
          >
            {t(option.labelKey)}
          </Chip>
        ))}
      </View>

    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
      paddingBottom: 24,
    },
    heroDisc: {
      width: 116,
      height: 116,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 28,
      letterSpacing: -0.28,
      lineHeight: 32,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      lineHeight: 25,
      color: tokens.fg2,
      textAlign: 'center',
      paddingHorizontal: 12,
      maxWidth: 300,
    },
    sectionLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 16,
      alignSelf: 'center',
      textAlign: 'center',
    },
    chipsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 12,
    },
  })
}
