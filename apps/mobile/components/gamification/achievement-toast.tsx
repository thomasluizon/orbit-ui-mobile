import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGamificationProfile } from '@/hooks/use-gamification'
import type { Achievement } from '@orbit/shared/types/gamification'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 380)

export function AchievementToast() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { newAchievements, invalidate } = useGamificationProfile()
  const { colors, shadows } = useAppTheme()
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null)
  const queueRef = useRef<Achievement[]>([])
  const visibleRef = useRef(false)
  const translateY = useRef(new Animated.Value(-100)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.95)).current
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

  const processQueue = useCallback(() => {
    if (visibleRef.current || queueRef.current.length === 0) return
    const next = queueRef.current.shift() ?? null
    setCurrentAchievement(next)
    visibleRef.current = true

    // Animate in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
    ]).start()

    // Auto-dismiss after 4s
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        visibleRef.current = false
        setCurrentAchievement(null)
        processQueue()
      })
    }, 4000)
  }, [translateY, opacity, scale])

  useEffect(() => {
    if (newAchievements.length > 0) {
      queueRef.current.push(...newAchievements)
      invalidate()
      if (!visibleRef.current) {
        processQueue()
      }
    }
  }, [newAchievements, invalidate, processQueue])

  if (!currentAchievement) return null

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 12 },
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.inner}>
        <Text style={styles.starIcon}>{'\u2B50'}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.label}>
            {t('gamification.toast.achievementUnlocked')}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {t(`gamification.achievements.${currentAchievement.id}.name`)}
          </Text>
          <Text style={styles.description} numberOfLines={1}>
            {t(`gamification.achievements.${currentAchievement.id}.description`)}
          </Text>
        </View>
        <View style={styles.xpBadge}>
          <Text style={styles.xpText}>
            {t('gamification.toast.xpEarned', {
              xp: currentAchievement.xpReward,
            })}
          </Text>
        </View>
      </View>
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors'], shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
      width: TOAST_WIDTH,
      zIndex: 10000,
    },
    inner: {
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.primary_30,
      borderRadius: radius.lg,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...shadows.lg,
    },
    starIcon: {
      fontSize: 30,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: colors.primary,
    },
    name: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    description: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    xpBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.xl,
      backgroundColor: colors.primary_15,
    },
    xpText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
  })
}
