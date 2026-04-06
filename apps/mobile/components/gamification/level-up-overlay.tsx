import { useMemo, useState, useEffect, useRef } from 'react'
import { View, Text, Animated, Easing, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LevelUpOverlay({
  leveledUp,
  newLevel,
  onClear,
}: Readonly<LevelUpOverlayProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const [level, setLevel] = useState(0)
  const [title, setTitle] = useState('')

  const overlayOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.6)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const outerRingRotation = useRef(new Animated.Value(0)).current
  const innerRingRotation = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Continuous ring spin animations
  useEffect(() => {
    const outerSpin = Animated.loop(
      Animated.timing(outerRingRotation, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    const innerSpin = Animated.loop(
      Animated.timing(innerRingRotation, {
        toValue: -1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )

    outerSpin.start()
    innerSpin.start()

    return () => {
      outerSpin.stop()
      innerSpin.stop()
    }
  }, [outerRingRotation, innerRingRotation])

  useEffect(() => {
    if (!leveledUp || !newLevel) return

    setLevel(newLevel)
    setTitle(t(`gamification.levels.${newLevel}`))

    // Reset
    overlayOpacity.setValue(0)
    contentScale.setValue(0.6)
    contentOpacity.setValue(0)

    // Animate in
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start()

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onClear()
      })
    }, 3000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [leveledUp, newLevel, onClear, t, overlayOpacity, contentScale, contentOpacity])

  const styles = useMemo(() => createStyles(colors), [colors])

  const outerSpin = outerRingRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const innerSpin = innerRingRotation.interpolate({
    inputRange: [-1, 0],
    outputRange: ['-360deg', '0deg'],
  })

  if (!leveledUp || !newLevel) return null

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ scale: contentScale }],
          },
        ]}
      >
        {/* Orbital ring animation */}
        <View style={styles.ringContainer}>
          {/* Outer ring */}
          <Animated.View
            style={[
              styles.outerRing,
              { transform: [{ rotate: outerSpin }] },
            ]}
          />
          {/* Inner ring */}
          <Animated.View
            style={[
              styles.innerRing,
              { transform: [{ rotate: innerSpin }] },
            ]}
          />
          {/* Level number */}
          <View style={styles.levelCenter}>
            <Text style={styles.levelNumber}>{level}</Text>
          </View>
        </View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={styles.labelText}>
            {t('gamification.levelUp.title')}
          </Text>
          <Text style={styles.titleText}>
            {t('gamification.levelUp.newLevel', { level })}
          </Text>
          <Text style={styles.subtitleText}>
            {t('gamification.levelUp.subtitle', { title })}
          </Text>
        </View>
      </Animated.View>
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
      zIndex: 10001,
      backgroundColor: 'rgba(0, 0, 0, 0.70)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      alignItems: 'center',
      gap: 16,
    },
    ringContainer: {
      width: 128,
      height: 128,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outerRing: {
      position: 'absolute',
      width: 128,
      height: 128,
      borderRadius: 64,
      borderWidth: 2,
      borderColor: colors.primary_30,
    },
    innerRing: {
      position: 'absolute',
      width: 112,
      height: 112,
      borderRadius: 56,
      borderWidth: 2,
      borderColor: colors.primary_80,
    },
    levelCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    levelNumber: {
      fontSize: 48,
      fontWeight: '800',
      color: colors.primary,
    },
    textContainer: {
      alignItems: 'center',
    },
    labelText: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 3,
      color: colors.primary,
    },
    titleText: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 4,
    },
    subtitleText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
  })
}
