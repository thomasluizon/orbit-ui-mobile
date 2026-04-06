import { useMemo, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Svg, { Circle, Path, Line } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_W } = Dimensions.get('window')
const FROST_COUNT = 12
const ICE_BLUE = 'rgba(56, 189, 248, 0.8)'
const ICE_BLUE_LIGHT = 'rgba(56, 189, 248, 0.4)'
const ICE_BLUE_BG = 'rgba(56, 189, 248, 0.1)'

function randomBetween(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

// ---------------------------------------------------------------------------
// Handle type
// ---------------------------------------------------------------------------

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StreakFreezeCelebration = forwardRef<StreakFreezeCelebrationHandle>(
  function StreakFreezeCelebration(_props, ref) {
    const { t } = useTranslation()
    const { colors } = useAppTheme()

    const overlayOpacity = useRef(new Animated.Value(0)).current
    const contentScale = useRef(new Animated.Value(0.7)).current
    const contentOpacity = useRef(new Animated.Value(0)).current
    const iconScale = useRef(new Animated.Value(0)).current
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const isShowingRef = useRef(false)

    // Frost particles
    const frostAnims = useRef(
      Array.from({ length: FROST_COUNT }, (_, i) => ({
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
        opacity: new Animated.Value(0),
        angle: (i / FROST_COUNT) * Math.PI * 2,
        distance: randomBetween(50, SCREEN_W * 0.35),
        size: randomBetween(3, 7),
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
        isShowingRef.current = false
      })
    }, [overlayOpacity])

    function show() {
      if (isShowingRef.current) return
      isShowingRef.current = true

      // Reset
      overlayOpacity.setValue(0)
      contentScale.setValue(0.7)
      contentOpacity.setValue(0)
      iconScale.setValue(0)
      frostAnims.forEach((f) => {
        f.translateX.setValue(0)
        f.translateY.setValue(0)
        f.opacity.setValue(0)
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
        Animated.spring(iconScale, {
          toValue: 1,
          tension: 50,
          friction: 6,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start()

      // Frost particles
      frostAnims.forEach((f, i) => {
        Animated.sequence([
          Animated.delay(i * 50),
          Animated.parallel([
            Animated.timing(f.opacity, {
              toValue: 0.7,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(f.translateX, {
              toValue: Math.cos(f.angle) * f.distance,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(f.translateY, {
              toValue: Math.sin(f.angle) * f.distance - 20,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(500),
              Animated.timing(f.opacity, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start()
      })

      // Auto-dismiss
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(dismiss, 3000)
    }

    useImperativeHandle(ref, () => ({ show }))

    useEffect(() => {
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      }
    }, [])

    return (
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={isShowingRef.current ? 'auto' : 'none'}
      >
        <Pressable style={styles.pressable} onPress={dismiss}>
          {/* Backdrop */}
          <View style={styles.backdrop} />

          {/* Frost particles */}
          {frostAnims.map((f, i) => (
            <Animated.View
              key={`frost-${i}`}
              style={[
                styles.frostParticle,
                {
                  width: f.size,
                  height: f.size,
                  borderRadius: f.size / 2,
                  opacity: f.opacity,
                  transform: [
                    { translateX: f.translateX },
                    { translateY: f.translateY },
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
            {/* Shield / snowflake icon */}
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Svg width={80} height={80} viewBox="0 0 80 80" fill="none">
                <Circle
                  cx={40}
                  cy={40}
                  r={38}
                  fill={ICE_BLUE_BG}
                  stroke={ICE_BLUE_LIGHT}
                  strokeWidth={1.5}
                />
                <Path
                  d="M40 18L56 26V42C56 52 48 60 40 64C32 60 24 52 24 42V26L40 18Z"
                  fill="rgba(56, 189, 248, 0.15)"
                  stroke="rgba(56, 189, 248, 0.6)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <Line
                  x1={40}
                  y1={30}
                  x2={40}
                  y2={50}
                  stroke={ICE_BLUE}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <Line
                  x1={30}
                  y1={35}
                  x2={50}
                  y2={45}
                  stroke="rgba(56, 189, 248, 0.6)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <Line
                  x1={50}
                  y1={35}
                  x2={30}
                  y2={45}
                  stroke="rgba(56, 189, 248, 0.6)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </Svg>
            </Animated.View>

            {/* Title */}
            <Text style={styles.title}>
              {t('streakDisplay.freeze.celebrationTitle')}
            </Text>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {t('streakDisplay.freeze.celebrationSubtitle')}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    )
  },
)

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
    frostParticle: {
      position: 'absolute',
      backgroundColor: 'rgba(147, 197, 253, 0.6)',
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
      textAlign: 'center',
      paddingHorizontal: 32,
    },
  })
}
