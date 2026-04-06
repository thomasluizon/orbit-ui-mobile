import { useMemo, useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProfile } from '@/hooks/use-profile'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 380)

const STORAGE_LAST_VISIT = 'orbit_last_visit'
const STORAGE_REFERRAL_APPLIED = 'orbit_referral_applied'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeBackToast() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { profile } = useProfile()
  const { colors, shadows } = useAppTheme()
  const [toastMessage, setToastMessage] = useState('')
  const [toastEmoji, setToastEmoji] = useState('\uD83D\uDC4B')
  const [shouldRender, setShouldRender] = useState(false)
  const checkedRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

  const translateY = useRef(new Animated.Value(-40)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.95)).current

  function showToast(message: string, emoji = '\uD83D\uDC4B') {
    setToastMessage(message)
    setToastEmoji(emoji)
    setShouldRender(true)

    // Animate in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start()

    // Auto-dismiss
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(dismiss, 4000)
  }

  function dismiss() {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -40,
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
  }

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
        // Check referral applied flag
        const referralApplied = await AsyncStorage.getItem(
          STORAGE_REFERRAL_APPLIED,
        )
        if (referralApplied) {
          await AsyncStorage.removeItem(STORAGE_REFERRAL_APPLIED)
          setTimeout(() => {
            showToast(t('referral.applied'), '\uD83C\uDF81')
          }, 800)
          return
        }

        const now = Date.now()
        const lastVisitRaw = await AsyncStorage.getItem(STORAGE_LAST_VISIT)
        const lastVisit = Number(lastVisitRaw ?? '0')
        await AsyncStorage.setItem(STORAGE_LAST_VISIT, String(now))

        // Show if >24h since last visit and user has an active streak
        const twentyFourHours = 24 * 60 * 60 * 1000
        if (
          lastVisit > 0 &&
          now - lastVisit > twentyFourHours &&
          (profile?.currentStreak ?? 0) > 0
        ) {
          setTimeout(() => {
            showToast(
              t('welcome.backMessage', { streak: profile?.currentStreak }),
            )
          }, 800)
        }
      } catch {
        // Silently ignore storage errors
      }
    }

    checkVisit()
  }, [profile, t])

  if (!shouldRender) return null

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
      <Pressable style={styles.toast} onPress={dismiss}>
        <View style={styles.row}>
          <Text style={styles.emoji}>{toastEmoji}</Text>
          <Text style={styles.message}>{toastMessage}</Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors'], shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
      width: TOAST_WIDTH,
      zIndex: 10000,
    },
    toast: {
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.xl,
      paddingHorizontal: 20,
      paddingVertical: 16,
      ...shadows.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    emoji: {
      fontSize: 24,
    },
    message: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
  })
}
