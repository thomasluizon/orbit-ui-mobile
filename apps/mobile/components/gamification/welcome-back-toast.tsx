import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Gift } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProfile } from '@/hooks/use-profile'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, shadowsV2, tintFromPrimary, zLayers } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 380)
const STORAGE_LAST_VISIT = 'orbit_last_visit'
const STORAGE_REFERRAL_APPLIED = 'orbit_referral_applied'

type ToastVariant = 'welcome' | 'referral'

/**
 * Welcome-back toast: kit toast surface with a streak-flame or gift disc,
 * uppercase eyebrow, and message line.
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
  const visitToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const translateY = useMemo(() => new Animated.Value(-20), [])
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.95), [])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -20,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 280,
        easing: toAnimatedEasing(easings.out),
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
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 280,
          easing: toAnimatedEasing(easings.out),
          useNativeDriver: true,
        }),
      ]).start()

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(dismiss, 4000)
    },
    [translateY, opacity, scale, dismiss],
  )

  const notifyReferralApplied = useEffectEvent(() => {
    showToast(t('referral.applied'), 'referral')
  })
  const notifyWelcomeBack = useEffectEvent((streak: number) => {
    showToast(t('welcome.backMessage', { streak }), 'welcome')
  })

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  // react-doctor-disable-next-line effect-needs-cleanup -- FP: the two deferred toast timers assigned to visitToastTimerRef inside checkVisit ARE cleared by this effect's returned cleanup (clearTimeout(visitToastTimerRef.current)); RD cannot trace the clear because the setTimeout is created inside the nested async helper. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    if (!profile || checkedRef.current) return
    checkedRef.current = true

    async function checkVisit() {
      try {
        const referralApplied = await AsyncStorage.getItem(STORAGE_REFERRAL_APPLIED)
        if (referralApplied) {
          await AsyncStorage.removeItem(STORAGE_REFERRAL_APPLIED)
          visitToastTimerRef.current = setTimeout(() => {
            notifyReferralApplied()
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
          visitToastTimerRef.current = setTimeout(() => {
            notifyWelcomeBack(profile?.currentStreak ?? 0)
          }, 800)
        }
      } catch {
      }
    }

    void checkVisit()

    return () => {
      if (visitToastTimerRef.current) clearTimeout(visitToastTimerRef.current)
    }
  }, [profile])

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
            backgroundColor: tokens.bgSheet,
            borderColor: tokens.hairline,
          },
        ]}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={message}
      >
        <View style={styles.row}>
          <View
            style={[
              styles.iconDisc,
              { backgroundColor: tintFromPrimary(tokens, 0.16) },
            ]}
          >
            {variant === 'welcome' ? (
              <Text style={styles.iconEmoji}>🔥</Text>
            ) : (
              <Gift size={17} strokeWidth={2.2} color={tokens.primarySoft} />
            )}
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
              {eyebrow}
            </Text>
            <Text style={[styles.message, { color: tokens.fg2 }]}>
              {message}
            </Text>
          </View>
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
    zIndex: zLayers.toast,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadowsV2.shadow3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 16,
    lineHeight: 20,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
