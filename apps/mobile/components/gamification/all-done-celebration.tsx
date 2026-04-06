import { useMemo, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui-store'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const CONFETTI_COUNT = 20
const RING_COUNT = 3

function randomBetween(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllDoneCelebration() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const allDoneCelebration = useUIStore((s) => s.allDoneCelebration)
  const setAllDoneCelebration = useUIStore((s) => s.setAllDoneCelebration)

  const overlayOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.7)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const checkScale = useRef(new Animated.Value(0)).current
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const confettiColors = useMemo(
    () => [
      colors.primary,
      colors.primary400,
      '#fbbf24',
      '#34d399',
      '#f87171',
      '#60a5fa',
    ],
    [colors],
  )

  // Confetti animations
  const confettiAnims = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0),
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)]!,
      angle: randomBetween(0, Math.PI * 2),
      distance: randomBetween(60, SCREEN_W * 0.45),
      size: randomBetween(4, 8),
    })),
  ).current

  // Ring animations
  const ringAnims = useRef(
    Array.from({ length: RING_COUNT }, () => ({
      scale: new Animated.Value(0),
      opacity: new Animated.Value(0.6),
    })),
  ).current
  const styles = useMemo(() => createStyles(colors), [colors])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setAllDoneCelebration(false)
    })
  }, [overlayOpacity, setAllDoneCelebration])

  useEffect(() => {
    if (!allDoneCelebration) return

    // Reset
    overlayOpacity.setValue(0)
    contentScale.setValue(0.7)
    contentOpacity.setValue(0)
    checkScale.setValue(0)
    confettiAnims.forEach((c) => {
      c.translateX.setValue(0)
      c.translateY.setValue(0)
      c.opacity.setValue(1)
      c.scale.setValue(0)
    })
    ringAnims.forEach((r) => {
      r.scale.setValue(0)
      r.opacity.setValue(0.6)
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
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 50,
        friction: 6,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start()

    // Confetti burst
    confettiAnims.forEach((c, i) => {
      const delay = i * 30
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.spring(c.scale, {
            toValue: 1,
            tension: 60,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(c.translateX, {
            toValue: Math.cos(c.angle) * c.distance,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(c.translateY, {
            toValue: Math.sin(c.angle) * c.distance,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(500),
            Animated.timing(c.opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start()
    })

    // Ring shockwaves
    ringAnims.forEach((r, i) => {
      Animated.sequence([
        Animated.delay(i * 200),
        Animated.parallel([
          Animated.timing(r.scale, {
            toValue: 3,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(r.opacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]).start()
    })

    // Auto-dismiss
    dismissTimerRef.current = setTimeout(dismiss, 3500)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [allDoneCelebration, dismiss, overlayOpacity, contentScale, contentOpacity, checkScale, confettiAnims, ringAnims])

  if (!allDoneCelebration) return null

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable style={styles.pressable} onPress={dismiss}>
        {/* Backdrop */}
        <View style={styles.backdrop} />

        {/* Orbit ring shockwaves */}
        {ringAnims.map((r, i) => (
          <Animated.View
            key={`ring-${i}`}
            style={[
              styles.ring,
              {
                opacity: r.opacity,
                transform: [{ scale: r.scale }],
              },
            ]}
          />
        ))}

        {/* Confetti particles */}
        {confettiAnims.map((c, i) => (
          <Animated.View
            key={`confetti-${i}`}
            style={[
              styles.confettiParticle,
              {
                width: c.size,
                height: c.size,
                borderRadius: c.size / 2,
                backgroundColor: c.color,
                opacity: c.opacity,
                transform: [
                  { translateX: c.translateX },
                  { translateY: c.translateY },
                  { scale: c.scale },
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
          {/* Check icon */}
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Svg width={80} height={80} viewBox="0 0 80 80" fill="none">
              <Circle
                cx={40}
                cy={40}
                r={38}
                fill={colors.primary}
                opacity={0.15}
                stroke={colors.primary}
                strokeWidth={2}
              />
              <Path
                d="M24 40l12 12 20-24"
                stroke={colors.primary}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>
            {t('habits.allDoneCelebrationTitle')}
          </Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {t('habits.allDoneCelebrationSubtitle')}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10003,
    },
    pressable: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.80)',
    },
    ring: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: colors.primary_30,
    },
    confettiParticle: {
      position: 'absolute',
    },
    content: {
      alignItems: 'center',
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 16,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginTop: 8,
    },
  })
}
