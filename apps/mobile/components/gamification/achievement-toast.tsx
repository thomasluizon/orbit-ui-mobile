import { useMemo, useState, useEffect, useRef, useCallback, useEffectEvent } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native'
import { Trophy } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, shadowsV2, tintFromPrimary, zLayers } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 380)

/**
 * Achievement toast: kit toast surface with a primary-tinted trophy disc and
 * a tabular XP eyebrow. Preserves the queue contract
 * (enqueue + completeActiveCelebration).
 */
export function AchievementToast() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { newAchievements, invalidate } = useGamificationProfile()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const [currentAchievement, setCurrentAchievement] = useState<{
    achievementId: string
    xpReward: number
  } | null>(null)
  const translateY = useMemo(() => new Animated.Value(-100), [])
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.96), [])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAchievement =
    activeCelebration?.kind === 'achievement' ? activeCelebration : null

  const dismiss = useCallback(
    (id?: string) => {
      if (!id) return
      if (timerRef.current) clearTimeout(timerRef.current)

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.96,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentAchievement(null)
        completeActiveCelebration(id)
      })
    },
    [completeActiveCelebration, opacity, scale, translateY],
  )

  const dismissAfterTimeout = useEffectEvent((id: string) => {
    dismiss(id)
  })

  useEffect(() => {
    if (newAchievements.length === 0) return

    for (const achievement of newAchievements) {
      enqueueCelebration('achievement', {
        achievementId: achievement.id,
        xpReward: achievement.xpReward,
      })
    }

    invalidate()
  }, [enqueueCelebration, invalidate, newAchievements])

  const [prevActiveAchievement, setPrevActiveAchievement] =
    useState(activeAchievement)
  if (activeAchievement !== prevActiveAchievement) {
    setPrevActiveAchievement(activeAchievement)
    if (activeAchievement) {
      setCurrentAchievement({
        achievementId: activeAchievement.payload.achievementId,
        xpReward: activeAchievement.payload.xpReward,
      })
    }
  }

  useEffect(() => {
    if (!activeAchievement) return

    translateY.setValue(-100)
    opacity.setValue(0)
    scale.setValue(0.96)

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
    ]).start()

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      dismissAfterTimeout(activeAchievement.id)
    }, 4000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeAchievement, opacity, scale, translateY])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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
      <View
        style={[
          styles.inner,
          {
            backgroundColor: tokens.bgSheet,
            borderColor: tokens.hairline,
          },
        ]}
      >
        <View
          style={[
            styles.iconDisc,
            { backgroundColor: tintFromPrimary(tokens, 0.16) },
          ]}
        >
          <Trophy size={17} strokeWidth={2.2} color={tokens.primarySoft} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.eyebrow, { color: tokens.primarySoft }]}>
            {t('gamification.toast.achievementEyebrow', {
              xp: currentAchievement.xpReward,
            })}
          </Text>
          <Text
            style={[styles.name, { color: tokens.fg1 }]}
            numberOfLines={1}
          >
            {t(
              `gamification.achievements.${currentAchievement.achievementId}.name`,
            )}
          </Text>
          <Text
            style={[styles.description, { color: tokens.fg3 }]}
            numberOfLines={2}
          >
            {t(
              `gamification.achievements.${currentAchievement.achievementId}.description`,
            )}
          </Text>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
    width: TOAST_WIDTH,
    zIndex: zLayers.toast,
  },
  inner: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...shadowsV2.shadow3,
  },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 11,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  name: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
})
