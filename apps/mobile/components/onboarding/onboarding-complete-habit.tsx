import { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg'
import { useLogHabit } from '@/hooks/use-habits'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingCompleteHabitProps {
  habitId: string | null
  habitTitle: string
  onCompleted: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingCompleteHabit({
  habitId,
  habitTitle,
  onCompleted,
}: Readonly<OnboardingCompleteHabitProps>) {
  const { t } = useTranslation()
  const [isCompleted, setIsCompleted] = useState(false)
  const [showStreak, setShowStreak] = useState(false)
  const isAnimating = useRef(false)

  const scaleAnim = useRef(new Animated.Value(1)).current
  const glowAnim = useRef(new Animated.Value(0)).current
  const streakOpacity = useRef(new Animated.Value(0)).current
  const streakSlide = useRef(new Animated.Value(20)).current

  const logHabit = useLogHabit()

  const handleComplete = useCallback(() => {
    if (!habitId || isCompleted || isAnimating.current) return

    isAnimating.current = true
    setIsCompleted(true)

    logHabit.mutate({ habitId })

    // Pop animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start()

    // Glow
    Animated.timing(glowAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

    // Show streak message after completion animation
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

    // Allow advancing after celebration
    setTimeout(() => {
      onCompleted()
    }, 2200)
  }, [habitId, isCompleted, logHabit, onCompleted, scaleAnim, glowAnim, streakOpacity, streakSlide])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.flow.completeHabit.title')}
      </Text>
      <Text style={styles.instruction}>
        {t('onboarding.flow.completeHabit.instruction')}
      </Text>

      {/* Simplified habit card */}
      <View
        style={[
          styles.habitCard,
          isCompleted && styles.habitCardCompleted,
        ]}
      >
        <View style={styles.habitInfo}>
          <Text style={styles.habitTitle} numberOfLines={1}>
            {habitTitle}
          </Text>
          <Text style={styles.habitHint}>
            {t('onboarding.flow.completeHabit.tapHint')}
          </Text>
        </View>

        {/* Completion circle */}
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={isCompleted}
          onPress={handleComplete}
        >
          <Animated.View
            style={[
              styles.circleBtn,
              isCompleted && styles.circleBtnCompleted,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {isCompleted && <Check size={20} color={colors.white} />}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Streak message */}
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
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Defs>
              <LinearGradient id="flame-grad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#fbbf24" />
                <Stop offset="0.45" stopColor="#f97316" />
                <Stop offset="1" stopColor="#ef4444" />
              </LinearGradient>
            </Defs>
            <Path
              d="M12 2C8.5 7 4 9.5 4 14a8 8 0 0016 0c0-4.5-4.5-7-8-12z"
              fill="url(#flame-grad)"
            />
          </Svg>
          <Text style={styles.streakText}>
            {t('onboarding.flow.completeHabit.success')}
          </Text>
        </Animated.View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  habitCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: colors.surface,
    ...shadows.md,
    elevation: 4,
  },
  habitCardCompleted: {
    borderColor: colors.primary_20,
  },
  habitInfo: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  habitHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.borderEmphasis,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnCompleted: {
    borderWidth: 0,
    backgroundColor: colors.primary,
    ...shadows.sm,
    elevation: 3,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
})
