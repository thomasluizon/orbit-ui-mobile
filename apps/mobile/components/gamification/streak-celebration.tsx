import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { useUIStore } from '@/stores/ui-store'
import { colors, radius } from '@/lib/theme'

const { width: SCREEN_W } = Dimensions.get('window')
const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const
const EMBER_COUNT = 12

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreakCelebration() {
  const { t } = useTranslation()
  const streakCelebration = useUIStore((s) => s.streakCelebration)
  const setStreakCelebration = useUIStore((s) => s.setStreakCelebration)
  const [streakCount, setStreakCount] = useState(0)

  const overlayOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.7)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const flamePulse = useRef(new Animated.Value(1)).current
  const numberScale = useRef(new Animated.Value(0)).current
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Ember particles (milestone only)
  const emberAnims = useRef(
    Array.from({ length: EMBER_COUNT }, (_, i) => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0),
      angle: (i / EMBER_COUNT) * Math.PI * 2,
      distance: 60 + Math.random() * (SCREEN_W * 0.3),
    })),
  ).current

  const isMilestone = useMemo(
    () => (MILESTONE_VALUES as readonly number[]).includes(streakCount),
    [streakCount],
  )

  const encouragement = useMemo(() => {
    if ((MILESTONE_VALUES as readonly number[]).includes(streakCount)) {
      return t('streakDisplay.celebration.milestone')
    }
    return t('streakDisplay.celebration.keepGoing')
  }, [streakCount, t])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setStreakCelebration(null)
    })
  }, [overlayOpacity, setStreakCelebration])

  useEffect(() => {
    if (!streakCelebration) return

    setStreakCount(streakCelebration.streak)

    // Reset
    overlayOpacity.setValue(0)
    contentScale.setValue(0.7)
    contentOpacity.setValue(0)
    flamePulse.setValue(1)
    numberScale.setValue(0)
    emberAnims.forEach((e) => {
      e.translateX.setValue(0)
      e.translateY.setValue(0)
      e.opacity.setValue(0)
    })

    // Animate in
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(numberScale, {
        toValue: 1,
        tension: 50,
        friction: 5,
        delay: 150,
        useNativeDriver: true,
      }),
    ]).start()

    // Flame pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(flamePulse, {
          toValue: 1.08,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(flamePulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start()

    // Embers (milestone only)
    const currentCount = streakCelebration.streak
    if ((MILESTONE_VALUES as readonly number[]).includes(currentCount)) {
      emberAnims.forEach((e, i) => {
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.parallel([
            Animated.timing(e.opacity, {
              toValue: 0.8,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(e.translateX, {
              toValue: Math.cos(e.angle) * e.distance,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(e.translateY, {
              toValue:
                Math.sin(e.angle) * e.distance - 40, // drift upward
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(600),
              Animated.timing(e.opacity, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start()
      })
    }

    // Auto-dismiss
    dismissTimerRef.current = setTimeout(dismiss, 2500)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [streakCelebration, dismiss, overlayOpacity, contentScale, contentOpacity, flamePulse, numberScale, emberAnims])

  if (!streakCelebration) return null

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable style={styles.pressable} onPress={dismiss}>
        {/* Backdrop */}
        <View style={styles.backdrop} />

        {/* Radial glow behind flame */}
        <View style={styles.glowContainer}>
          <View
            style={[
              styles.glow,
              isMilestone ? styles.glowStrong : styles.glowNormal,
            ]}
          />
        </View>

        {/* Ember particles */}
        {isMilestone &&
          emberAnims.map((e, i) => (
            <Animated.View
              key={`ember-${i}`}
              style={[
                styles.ember,
                {
                  opacity: e.opacity,
                  transform: [
                    { translateX: e.translateX },
                    { translateY: e.translateY },
                  ],
                },
              ]}
            />
          ))}

        {/* Core content */}
        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentOpacity,
              transform: [{ scale: contentScale }],
            },
          ]}
        >
          {/* Flame icon */}
          <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
            <Svg width={80} height={100} viewBox="0 0 64 80" fill="none">
              <Defs>
                <LinearGradient
                  id="celebFlameGrad"
                  x1="32"
                  y1="0"
                  x2="32"
                  y2="80"
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop offset="0" stopColor="#fbbf24" />
                  <Stop offset="0.45" stopColor="#f97316" />
                  <Stop offset="1" stopColor="#ef4444" />
                </LinearGradient>
              </Defs>
              <Path
                d="M32 0C32 0 8 26 8 48a24 24 0 0 0 48 0C56 26 32 0 32 0Zm0 68a12 12 0 0 1-12-12c0-8 12-22 12-22s12 14 12 22a12 12 0 0 1-12 12Z"
                fill="url(#celebFlameGrad)"
              />
            </Svg>
          </Animated.View>

          {/* Streak number */}
          <Animated.View style={{ transform: [{ scale: numberScale }] }}>
            <Text style={styles.streakNumber}>{streakCount}</Text>
          </Animated.View>

          {/* Subtitle */}
          <Text style={styles.subtitleText}>
            {plural(
              t('streakDisplay.celebration.subtitle', {
                count: streakCount,
              }),
              streakCount,
            )}
          </Text>

          {/* Encouragement */}
          <Text style={styles.encouragementText}>{encouragement}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10002,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  glowContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    width: 192,
    height: 192,
    borderRadius: 96,
  },
  glowNormal: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  glowStrong: {
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
  },
  ember: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f97316',
  },
  content: {
    alignItems: 'center',
  },
  streakNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
    marginTop: 8,
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 3,
    color: colors.orange300,
    marginTop: 6,
  },
  encouragementText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 10,
  },
})
