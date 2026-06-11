import { useMemo, useState, useCallback, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useLogHabit } from '@/hooks/use-habits'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface OnboardingCompleteHabitProps {
  habitId: string | null
  habitTitle: string
  onCompleted: () => void
}

/**
 * ob-4 step: "Now complete it." Kit habit card with the created habit and a
 * tap-to-complete check circle.
 */
export function OnboardingCompleteHabit({
  habitId,
  habitTitle,
  onCompleted,
}: Readonly<OnboardingCompleteHabitProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [isCompleted, setIsCompleted] = useState(false)
  const [showStreak, setShowStreak] = useState(false)
  const isAnimating = useRef(false)

  const scaleAnim = useMemo(() => new Animated.Value(1), [])
  const streakOpacity = useMemo(() => new Animated.Value(0), [])
  const streakSlide = useMemo(() => new Animated.Value(20), [])

  const logHabit = useLogHabit()

  const handleComplete = useCallback(() => {
    if (!habitId || isCompleted || isAnimating.current) return

    isAnimating.current = true
    setIsCompleted(true)

    logHabit.mutate({ habitId })

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 100,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
    ]).start()

    setTimeout(() => {
      setShowStreak(true)
      Animated.parallel([
        Animated.timing(streakOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(streakSlide, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start()
    }, 800)

    setTimeout(() => {
      onCompleted()
    }, 2200)
  }, [
    habitId,
    isCompleted,
    logHabit,
    onCompleted,
    scaleAnim,
    streakOpacity,
    streakSlide,
  ])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.flow.completeHabit.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.completeHabit.instruction')}
      </Text>

      <View style={styles.habitRow}>
        <View style={styles.habitInfo}>
          <Text style={styles.habitTitle} numberOfLines={1}>
            {habitTitle}
          </Text>
          <Text style={styles.habitHint}>
            {t('onboarding.flow.completeHabit.tapHint')}
          </Text>
        </View>

        <Pressable disabled={isCompleted} onPress={handleComplete} hitSlop={8}>
          <Animated.View
            style={[
              styles.dot,
              {
                borderColor: isCompleted
                  ? tokens.primary
                  : tokens.statusEmpty,
                backgroundColor: isCompleted ? tokens.primary : 'transparent',
              },
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {isCompleted && (
              <Check size={17} color={tokens.fgOnPrimary} strokeWidth={2.6} />
            )}
          </Animated.View>
        </Pressable>
      </View>

      {showStreak && (
        <Animated.View
          style={[
            styles.streakRow,
            {
              opacity: streakOpacity,
              transform: [{ translateY: streakSlide }],
            },
          ]}
        >
          <Text style={styles.streakText}>
            {t('onboarding.flow.completeHabit.success')}
          </Text>
        </Animated.View>
      )}
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      gap: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      letterSpacing: -0.24,
      lineHeight: 31,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },
    habitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 18,
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
      marginTop: 12,
    },
    habitInfo: {
      flex: 1,
    },
    habitTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    habitHint: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      marginTop: 3,
    },
    dot: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakRow: {
      alignItems: 'center',
      paddingTop: 8,
    },
    streakText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.primary,
    },
  })
}
