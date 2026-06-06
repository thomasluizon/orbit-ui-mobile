import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

/**
 * v8 Level-up overlay: rotating orbit ellipse + mono level number.
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

  useEffect(() => {
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
  }, [ringRotation])

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
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false)
        completeActiveCelebration(id)
        onClear()
      })
    },
    [completeActiveCelebration, onClear, overlayOpacity],
  )

  useEffect(() => {
    if (!activeLevelUp) return

     
    setLevel(activeLevelUp.payload.level)
    setShouldRender(true)
    overlayOpacity.setValue(0)

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

    timerRef.current = setTimeout(() => {
      dismiss(activeLevelUp.id)
    }, 3000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeLevelUp, dismiss, overlayOpacity])

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
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('gamification.levelUp.title')}</Text>

        <View style={styles.ringWrapper}>
          <Animated.View
            style={[
              styles.ringContainer,
              { transform: [{ rotate: spin }] },
            ]}
            pointerEvents="none"
          >
            <Svg width={130} height={130}>
              <Ellipse
                cx={65}
                cy={65}
                rx={62}
                ry={22}
                fill="none"
                stroke={tokens.primary}
                strokeWidth={1.5}
              />
            </Svg>
          </Animated.View>
          <Text style={styles.levelNumber}>
            {String(level).padStart(2, '0')}
          </Text>
        </View>

        <Text style={styles.subtitle}>
          {t('gamification.levelUp.steadyHand')}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10001,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 14,
  },
  eyebrow: {
    fontFamily: 'GeistMono',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.98,
    textTransform: 'uppercase',
  },
  ringWrapper: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    position: 'absolute',
    width: 130,
    height: 130,
  },
  levelNumber: {
    fontFamily: 'GeistMono',
    fontSize: 80,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -3.2,
  },
  subtitle: {
    fontFamily: 'Geist',
    fontSize: 16,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
  },
})
