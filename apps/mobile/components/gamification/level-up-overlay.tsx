import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2, easings, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useOverlayBack } from '@/hooks/use-overlay-back'
import { GradientTop } from '@/components/ui/gradient-top'
import { useCelebrationEntrance } from './celebration-motion'

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

/**
 * Level-up overlay: star hero disc and a rotating orbit ellipse around the big
 * Inter level numeral. Dismissed by tap, back press, or the auto-dismiss timer.
 * Preserves queue contract (enqueueCelebration / completeActiveCelebration).
 */
export function LevelUpOverlay({
  leveledUp,
  newLevel,
  onClear,
}: Readonly<LevelUpOverlayProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const prefersReducedMotion = usePrefersReducedMotion()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const [level, setLevel] = useState(0)
  const [shouldRender, setShouldRender] = useState(false)

  const overlayOpacity = useMemo(() => new Animated.Value(0), [])
  const ringRotation = useMemo(() => new Animated.Value(0), [])
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const activeLevelUp =
    activeCelebration?.kind === 'level-up' ? activeCelebration : null
  const { orbStyle, titleStyle, subtitleStyle } = useCelebrationEntrance(
    Boolean(activeLevelUp),
  )

  useEffect(() => {
    if (prefersReducedMotion) return

    const spin = Animated.loop(
      Animated.timing(ringRotation, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    spin.start()
    return () => {
      spin.stop()
    }
  }, [prefersReducedMotion, ringRotation])

  useEffect(() => {
    if (leveledUp && newLevel) {
      enqueueCelebration('level-up', { level: newLevel })
    }
  }, [enqueueCelebration, leveledUp, newLevel])

  const dismiss = useCallback(
    (id?: string) => {
      if (!id) return
      if (timerRef.current) clearTimeout(timerRef.current)

      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false)
        completeActiveCelebration(id)
        onClear()
      })
    },
    [completeActiveCelebration, onClear, overlayOpacity],
  )

  const [prevActiveLevelUp, setPrevActiveLevelUp] = useState(activeLevelUp)
  if (activeLevelUp !== prevActiveLevelUp) {
    setPrevActiveLevelUp(activeLevelUp)
    if (activeLevelUp) {
      setLevel(activeLevelUp.payload.level)
      setShouldRender(true)
    }
  }

  useEffect(() => {
    if (!activeLevelUp) return

    overlayOpacity.setValue(0)

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start()

    timerRef.current = setTimeout(() => {
      dismiss(activeLevelUp.id)
    }, 6000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeLevelUp, dismiss, overlayOpacity])

  useOverlayBack(shouldRender, () => dismiss(activeLevelUp?.id))

  const spin = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '342deg'],
  })

  if (!shouldRender) return null

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Pressable
        style={styles.pressable}
        onPress={() => dismiss(activeLevelUp?.id)}
        accessibilityRole="button"
        accessibilityLabel={t('gamification.levelUp.title')}
      >
        <View style={[styles.backdrop, { backgroundColor: tokens.bg }]} />
        <GradientTop height={520} />
        <View style={styles.content} pointerEvents="none">
          <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
            {t('gamification.levelUp.title')}
          </Text>

          <Animated.View
            style={[
              styles.heroDisc,
              {
                backgroundColor: tintFromPrimary(tokens, 0.16),
                shadowColor: tokens.primary,
              },
              orbStyle,
            ]}
          >
            <Text style={styles.heroEmoji}>⭐</Text>
          </Animated.View>

          <Animated.View style={[styles.ringWrapper, titleStyle]}>
            <Animated.View
              style={[
                styles.ringContainer,
                { transform: [{ rotate: spin }] },
              ]}
              pointerEvents="none"
            >
              <Svg width={150} height={150}>
                <Ellipse
                  cx={75}
                  cy={75}
                  rx={72}
                  ry={26}
                  fill="none"
                  stroke={tokens.primary}
                  strokeWidth={1.5}
                />
              </Svg>
            </Animated.View>
            <Text style={[styles.levelNumber, { color: tokens.fg1 }]}>
              {String(level).padStart(2, '0')}
            </Text>
          </Animated.View>

          <Animated.Text style={[styles.subtitle, { color: tokens.fg2 }, subtitleStyle]}>
            {t('gamification.levelUp.steadyHand')}
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10001,
  },
  pressable: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.96,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  eyebrow: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  heroDisc: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 60,
    elevation: 8,
  },
  heroEmoji: {
    fontSize: 60,
    lineHeight: 72,
  },
  ringWrapper: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    position: 'absolute',
    width: 150,
    height: 150,
  },
  levelNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 56,
    letterSpacing: -1.12,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
})
