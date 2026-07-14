import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import {
  AccessibilityInfo,
  View,
  Text,
  Modal,
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the entrance/exit transforms & opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  StyleSheet,
} from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, tintFromPrimary } from '@/lib/theme'
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

  const handleComplete = useEffectEvent(() => {
    setVisible(false)
    onComplete()
  })

  useEffect(() => {
    const easeOut = toAnimatedEasing(easings.out)
    let cancelled = false

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return

      if (reduceMotion) {
        scaleAnim.setValue(1)
        ringOpacity1.setValue(0)
        ringOpacity2.setValue(0)
        textOpacity.setValue(1)
        textSlide.setValue(0)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: easeOut,
          useNativeDriver: true,
        }).start()
        return
      }

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 280,
          easing: easeOut,
          useNativeDriver: true,
        }),
      ]).start()

      Animated.parallel([
        Animated.timing(ringScale1, {
          toValue: 3,
          duration: 1200,
          delay: 200,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity1, {
          toValue: 0,
          duration: 1200,
          delay: 200,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(ringScale2, {
          toValue: 3,
          duration: 1200,
          delay: 400,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity2, {
          toValue: 0,
          duration: 1200,
          delay: 400,
          easing: easeOut,
          useNativeDriver: true,
        }),
      ]).start()

      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          delay: 300,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 400,
          delay: 300,
          easing: easeOut,
          useNativeDriver: true,
        }),
      ]).start()
    })

    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start()
    }, 2000)

    const completeTimer = setTimeout(() => {
      handleComplete()
    }, 2500)

    return () => {
      cancelled = true
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [fadeAnim, scaleAnim, ringScale1, ringOpacity1, ringScale2, ringOpacity2, textOpacity, textSlide])

  if (!visible) return null

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onComplete}
    >
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
      ...StyleSheet.absoluteFill,
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
      borderColor: tintFromPrimary(tokens, 0.45),
    },
    orb: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: tintFromPrimary(tokens, 0.15),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: tintFromPrimary(tokens, 0.28),
    },
    textContainer: {
      marginTop: 40,
      alignItems: 'center',
    },
    titleText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      color: tokens.fg1,
      textAlign: 'center',
      letterSpacing: -0.24,
    },
    subtitleText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
      marginTop: 8,
    },
  })
}
