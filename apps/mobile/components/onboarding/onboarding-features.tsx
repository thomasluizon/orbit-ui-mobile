import { useEffect, useMemo } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import {
  BellRing,
  CalendarDays,
  ListTree,
  Orbit,
  Trophy,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface FeatureItem {
  Icon: LucideIcon
  titleKey: string
  descKey: string
}

const features: FeatureItem[] = [
  {
    Icon: Orbit,
    titleKey: 'onboarding.flow.features.chat.title',
    descKey: 'onboarding.flow.features.chat.desc',
  },
  {
    Icon: ListTree,
    titleKey: 'onboarding.flow.features.subHabits.title',
    descKey: 'onboarding.flow.features.subHabits.desc',
  },
  {
    Icon: CalendarDays,
    titleKey: 'onboarding.flow.features.calendar.title',
    descKey: 'onboarding.flow.features.calendar.desc',
  },
  {
    Icon: Trophy,
    titleKey: 'onboarding.flow.features.achievements.title',
    descKey: 'onboarding.flow.features.achievements.desc',
  },
  {
    Icon: BellRing,
    titleKey: 'onboarding.flow.features.notifications.title',
    descKey: 'onboarding.flow.features.notifications.desc',
  },
]

/**
 * Features step: "What else Orbit does." Hairline-divided kit list rows with
 * 22px icons, Rubik titles, and muted descriptions.
 */
export function OnboardingFeatures() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const stagger = useMemo(
    () => features.map(() => new Animated.Value(0)),
    [],
  )

  useEffect(() => {
    if (prefersReducedMotion) {
      for (const value of stagger) value.setValue(1)
      return
    }
    const animation = Animated.stagger(
      40,
      stagger.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
      ),
    )
    animation.start()
    return () => animation.stop()
  }, [prefersReducedMotion, stagger])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.flow.features.title')}
      </Text>

      <View style={styles.list}>
        {features.map((feature, index) => (
          <Animated.View
            key={feature.titleKey}
            style={[
              styles.row,
              {
                opacity: stagger[index],
                transform: [
                  {
                    translateY: stagger[index]!.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconSlot}>
              <feature.Icon size={22} color={tokens.fg2} strokeWidth={1.8} />
            </View>
            <View style={styles.text}>
              <Text style={styles.featureTitle}>
                {t(feature.titleKey, { defaultValue: feature.titleKey })}
              </Text>
              <Text style={styles.featureDesc}>
                {t(feature.descKey, { defaultValue: feature.descKey })}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      paddingTop: 12,
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      letterSpacing: -0.24,
      lineHeight: 31,
      color: tokens.fg1,
      textAlign: 'center',
      marginBottom: 14,
    },
    list: {
      gap: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    iconSlot: {
      width: 26,
      alignItems: 'center',
      paddingTop: 1,
    },
    text: {
      flex: 1,
      gap: 3,
    },
    featureTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    featureDesc: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13.5,
      lineHeight: 19,
      color: tokens.fg3,
    },
  })
}
