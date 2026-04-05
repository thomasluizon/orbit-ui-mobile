import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Modal,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FreshStartAnimationProps {
  onComplete: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreshStartAnimation({ onComplete }: Readonly<FreshStartAnimationProps>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(true)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.3)).current
  const ringScale1 = useRef(new Animated.Value(0.5)).current
  const ringOpacity1 = useRef(new Animated.Value(0.6)).current
  const ringScale2 = useRef(new Animated.Value(0.5)).current
  const ringOpacity2 = useRef(new Animated.Value(0.4)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const textSlide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start()

    // Ring animation
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale1, {
            toValue: 2,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale1, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity1, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity1, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start()

    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(ringScale2, {
            toValue: 2.5,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale2, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(ringOpacity2, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity2, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start()

    // Text entrance
    Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }),
      Animated.timing(textSlide, {
        toValue: 0,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start()

    // Fade out at 2s
    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start()
    }, 2000)

    // Complete at 2.5s
    const completeTimer = setTimeout(() => {
      setVisible(false)
      onComplete()
    }, 2500)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete, fadeAnim, scaleAnim, ringScale1, ringOpacity1, ringScale2, ringOpacity2, textOpacity, textSlide])

  if (!visible) return null

  return (
    <Modal visible transparent animationType="none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        {/* Backdrop */}
        <View style={styles.backdrop} />

        {/* Center content */}
        <View style={styles.center}>
          {/* Rings */}
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ringScale1 }],
                opacity: ringOpacity1,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ringScale2 }],
                opacity: ringOpacity2,
              },
            ]}
          />

          {/* Center orb */}
          <Animated.View
            style={[
              styles.orb,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            <RefreshCw size={32} color={colors.textPrimary} />
          </Animated.View>

          {/* Text */}
          <Animated.View
            style={[
              styles.textContainer,
              {
                opacity: textOpacity,
                transform: [{ translateY: textSlide }],
              },
            ]}
          >
            <Text style={styles.titleText}>
              {t('profile.freshStart.successTitle')}
            </Text>
            <Text style={styles.subtitleText}>
              {t('profile.freshStart.successSubtitle')}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${colors.background}E6`,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary_30,
  },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary_20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary_30,
  },
  textContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
})
