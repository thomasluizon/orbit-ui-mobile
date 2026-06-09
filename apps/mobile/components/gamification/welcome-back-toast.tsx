import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProfile } from '@/hooks/use-profile'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 380)
const STORAGE_LAST_VISIT = 'orbit_last_visit'
const STORAGE_REFERRAL_APPLIED = 'orbit_referral_applied'

type ToastVariant = 'welcome' | 'referral'

/**
 * v8 Welcome-back toast: hairline-ringed orbit dot + uppercase eyebrow + italic body.
 * Preserves the AsyncStorage gating + lifecycle.
 */
export function WelcomeBackToast() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { profile } = useProfile()
  const [variant, setVariant] = useState<ToastVariant>('welcome')
  const [message, setMessage] = useState('')
  const [shouldRender, setShouldRender] = useState(false)
  const checkedRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const translateY = useMemo(() => new Animated.Value(-20), [])
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.95), [])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -20,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShouldRender(false)
    })
  }, [translateY, opacity, scale])

  const showToast = useCallback(
    (nextMessage: string, kind: ToastVariant) => {
      setMessage(nextMessage)
      setVariant(kind)
      setShouldRender(true)

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 400,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 400,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
      ]).start()

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(dismiss, 4000)
    },
    [translateY, opacity, scale, dismiss],
  )

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!profile || checkedRef.current) return
    checkedRef.current = true

    async function checkVisit() {
      try {
        const referralApplied = await AsyncStorage.getItem(STORAGE_REFERRAL_APPLIED)
        if (referralApplied) {
          await AsyncStorage.removeItem(STORAGE_REFERRAL_APPLIED)
          setTimeout(() => {
            showToast(t('referral.applied'), 'referral')
          }, 800)
          return
        }

        const now = Date.now()
        const lastVisitRaw = await AsyncStorage.getItem(STORAGE_LAST_VISIT)
        const lastVisit = Number(lastVisitRaw ?? '0')
        await AsyncStorage.setItem(STORAGE_LAST_VISIT, String(now))

        const twentyFourHours = 24 * 60 * 60 * 1000
        if (
          lastVisit > 0 &&
          now - lastVisit > twentyFourHours &&
          (profile?.currentStreak ?? 0) > 0
        ) {
          setTimeout(() => {
            showToast(
              t('welcome.backMessage', { streak: profile?.currentStreak }),
              'welcome',
            )
          }, 800)
        }
      } catch {
      }
    }

    checkVisit()
  }, [profile, t, showToast])

  if (!shouldRender) return null

  const eyebrow =
    variant === 'welcome' ? t('welcome.eyebrow') : t('referral.eyebrow')

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
    >
      <Pressable
        style={[
          styles.toast,
          {
            backgroundColor: tokens.bgElev,
            borderColor: tokens.hairline,
          },
        ]}
        onPress={dismiss}
        accessibilityLabel={message}
      >
        <View style={styles.row}>
          <View style={styles.textCol}>
            <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
              {eyebrow}
            </Text>
            <Text style={[styles.message, { color: tokens.fg2 }]}>
              {message}
            </Text>
          </View>
          <Svg width={24} height={24} style={styles.dot}>
            <Circle
              cx={12}
              cy={12}
              r={10.5}
              fill="none"
              stroke={tokens.primary}
              strokeWidth={1}
            />
          </Svg>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
    width: TOAST_WIDTH,
    zIndex: 10000,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadowsV2.shadow2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontFamily: 'Geist',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  dot: {
    flexShrink: 0,
  },
})
