import { useMemo, useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  Animated,
  StyleSheet,
} from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface FreshStartAnimationProps {
  onComplete: () => void
}

export function FreshStartAnimation({ onComplete }: Readonly<FreshStartAnimationProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [visible, setVisible] = useState(true)

  const fadeAnim = useMemo(() => new Animated.Value(0), [])
  const scaleAnim = useMemo(() => new Animated.Value(0.3), [])
  const ringScale1 = useMemo(() => new Animated.Value(0.5), [])
  const ringOpacity1 = useMemo(() => new Animated.Value(0.6), [])
  const ringScale2 = useMemo(() => new Animated.Value(0.5), [])
  const ringOpacity2 = useMemo(() => new Animated.Value(0.6), [])
  const textOpacity = useMemo(() => new Animated.Value(0), [])
  const textSlide = useMemo(() => new Animated.Value(20), [])
  const styles = useMemo(() => createStyles(tokens), [tokens])

  useEffect(() => {
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

    Animated.parallel([
      Animated.timing(ringScale1, {
        toValue: 3,
        duration: 1200,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity1, {
        toValue: 0,
        duration: 1200,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(ringScale2, {
        toValue: 3,
        duration: 1200,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity2, {
        toValue: 0,
        duration: 1200,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start()

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

    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start()
    }, 2000)

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
        <View style={styles.backdrop} />

        <View style={styles.center}>
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

          <Animated.View
            style={[
              styles.orb,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            <RefreshCw size={32} color={tokens.fg1} />
          </Animated.View>

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

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: `${tokens.bg}E6`,
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
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    orb: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: tokens.hairlineStrong,
    },
    textContainer: {
      marginTop: 40,
      alignItems: 'center',
    },
    titleText: {
      fontSize: 24,
      fontWeight: '700',
      color: tokens.fg1,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    subtitleText: {
      fontSize: 14,
      color: tokens.fg2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
