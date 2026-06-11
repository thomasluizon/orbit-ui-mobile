import { useEffect, useMemo } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { VerifiedBadge } from '@/components/ui/verified-badge'

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

/**
 * Tudo certo (allset) step: VerifiedBadge hero, display title, recap rows,
 * trial InfoCard. Preserves trial info + onFinish.
 */
export function OnboardingComplete({
  createdHabit,
  createdGoal,
  onFinish,
}: Readonly<OnboardingCompleteProps>) {
  const { t } = useTranslation()
  const { displayDate } = useDateFormat()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const badgeScale = useMemo(() => new Animated.Value(0), [])
  const badgePop = useMemo(() => new Animated.Value(0), [])
  const rise = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      badgeScale.setValue(1)
      rise.setValue(1)
      return
    }
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.spring(badgeScale, {
          toValue: 1,
          stiffness: 220,
          damping: 22,
          mass: 1,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(badgePop, {
            toValue: 1,
            duration: 100,
            easing: toAnimatedEasing(easings.out),
            useNativeDriver: true,
          }),
          Animated.timing(badgePop, {
            toValue: 0,
            duration: 100,
            easing: toAnimatedEasing(easings.out),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(rise, {
        toValue: 1,
        duration: 560,
        delay: 160,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
    ])
    animation.start()
    return () => animation.stop()
  }, [badgePop, badgeScale, prefersReducedMotion, rise])

  const riseSlot = (from: number, to: number) => ({
    opacity: rise.interpolate({
      inputRange: [from, to],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [from, to],
          outputRange: [12, 0],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  })

  const formattedTrialEnd = useMemo(() => {
    if (!profile?.trialEndsAt) return ''
    return displayDate(parseISO(profile.trialEndsAt))
  }, [profile, displayDate])

  const recapItems = useMemo(() => {
    const items = [
      {
        key: 'habit',
        label: t('onboarding.flow.complete.recap.habit'),
        show: !!createdHabit,
      },
      {
        key: 'goal',
        label: t('onboarding.flow.complete.recap.goal'),
        show: createdGoal,
      },
      {
        key: 'theme',
        label: t('onboarding.flow.complete.recap.theme'),
        show: hasProAccess,
      },
      {
        key: 'astra',
        label: t('onboarding.flow.complete.recap.astra'),
        show: true,
      },
    ]
    return items.filter((item) => item.show)
  }, [createdHabit, createdGoal, hasProAccess, t])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Animated.View
          style={{
            opacity: badgeScale,
            transform: [
              {
                scale: Animated.multiply(
                  badgeScale.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                  badgePop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.12],
                  }),
                ),
              },
            ],
          }}
        >
          <VerifiedBadge size={96} />
        </Animated.View>
        <Animated.Text style={[styles.title, riseSlot(0, 0.45)]}>
          {t('onboarding.flow.complete.title')}
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, riseSlot(0.1, 0.55)]}>
          {t('onboarding.flow.complete.subtitle')}
        </Animated.Text>
      </View>

      <Animated.View style={[styles.recapList, riseSlot(0.25, 0.7)]}>
        {recapItems.map((item) => (
          <View key={item.key} style={styles.recapRow}>
            <Text style={styles.recapText}>{item.label}</Text>
            <Check size={18} color={tokens.primary} strokeWidth={1.8} />
          </View>
        ))}
      </Animated.View>

      {profile?.isTrialActive && (
        <Animated.View style={riseSlot(0.4, 0.85)}>
          <InfoCard
            title={t('onboarding.flow.complete.trialTitle')}
            desc={t('onboarding.flow.complete.trialDesc', {
              date: formattedTrialEnd,
            })}
          />
        </Animated.View>
      )}

      <Animated.View style={[styles.startBtnWrap, riseSlot(0.55, 1)]}>
        <PillButton fullWidth onPress={onFinish}>
          {t('onboarding.flow.complete.start')}
        </PillButton>
      </Animated.View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      gap: 22,
      paddingTop: 12,
      paddingBottom: 12,
    },
    header: {
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
    },
    title: {
      fontFamily: 'Inter_700Bold',
      fontSize: 34,
      letterSpacing: -0.34,
      lineHeight: 39,
      color: tokens.fg1,
      textAlign: 'center',
      marginTop: 6,
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      lineHeight: 24,
      color: tokens.fg2,
      textAlign: 'center',
      maxWidth: 280,
    },
    recapList: {
      gap: 0,
    },
    recapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    recapText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg2,
    },
    startBtnWrap: {
      marginTop: 8,
    },
  })
}
