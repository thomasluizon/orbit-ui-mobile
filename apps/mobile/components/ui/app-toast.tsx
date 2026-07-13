import { useEffect, useMemo, useRef, useCallback } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Bell, Check, Clock, X } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { schemes } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { toAnimatedEasing } from '@/lib/motion'
import {
  createTokensV2,
  easings,
  lightenHex,
  shadowsV2,
  tintFromPrimary,
  type AppTokensV2,
} from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAppToastStore } from '@/stores/app-toast-store'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 420)
const TOAST_DURATION_MS = 4500
const ACTION_TOAST_DURATION_MS = 6000

type Variant = 'success' | 'error' | 'info' | 'queued'

interface VariantStyle {
  icon: LucideIcon
  tint: string
  discBg: string
}

/**
 * Toast per the toast-success/error/info/queued artboards: solid sheet card,
 * radius 18, leading 32px status icon disc, Rubik 15/500 message, optional
 * accent action. Preserves the existing store contract (queue + variants,
 * including the offline `queued` kind).
 */
export function AppToast() {
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const currentToast = useAppToastStore((state) => state.currentToast)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const translateY = useMemo(() => new Animated.Value(-48), [])
  const opacity = useMemo(() => new Animated.Value(0), [])
  const scale = useMemo(() => new Animated.Value(0.96), [])
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  const hideToast = useCallback(() => {
    clearTimer()
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -48,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissToast()
    })
  }, [clearTimer, dismissToast, opacity, scale, translateY])

  // react-doctor-disable-next-line effect-needs-cleanup -- the effect returns clearTimer, which clears the setTimeout stored in dismissTimerRef (indirected so hideToast can also cancel it); the separate unmount effect below is a belt-and-suspenders guard https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    if (!currentToast) {
      clearTimer()
      translateY.setValue(-48)
      opacity.setValue(0)
      scale.setValue(0.96)
      return
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
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

    clearTimer()
    dismissTimerRef.current = setTimeout(
      hideToast,
      currentToast.actionLabel ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS,
    )

    return clearTimer
  }, [clearTimer, currentToast, hideToast, opacity, scale, translateY])

  useEffect(() => clearTimer, [clearTimer])

  if (!currentToast) return null

  const variantStyle = getVariantStyle(currentToast.variant, tokens, currentTheme)
  const Icon = variantStyle.icon

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + 12,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Pressable
        style={[
          styles.toast,
          {
            backgroundColor: tokens.bgSheet,
            borderColor: tokens.hairline,
          },
        ]}
        onPress={hideToast}
        accessibilityRole="button"
      >
        <View style={[styles.iconDisc, { backgroundColor: variantStyle.discBg }]}>
          <Icon size={17} color={variantStyle.tint} strokeWidth={2.4} />
        </View>
        <Text style={[styles.message, { color: tokens.fg1 }]}>
          {currentToast.message}
        </Text>
        {currentToast.actionLabel ? (
          <Pressable onPress={triggerAction} hitSlop={8} style={styles.actionButton} accessibilityRole="button">
            <Text style={[styles.actionText, { color: tokens.primarySoft }]}>
              {currentToast.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  const alphaByte = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${alphaByte}`
}

function getVariantStyle(
  variant: Variant,
  tokens: AppTokensV2,
  themeMode: ThemeMode,
): VariantStyle {
  const isLight = themeMode === 'light'

  switch (variant) {
    case 'success': {
      const successAccent = schemes.green.accent[isLight ? 'light' : 'dark']
      return {
        icon: Check,
        tint: successAccent.primary,
        discBg: `rgba(${successAccent.primaryRgb}, 0.16)`,
      }
    }
    case 'info':
      return {
        icon: Bell,
        tint: tokens.primarySoft,
        discBg: tintFromPrimary(tokens, 0.18),
      }
    case 'queued':
      return {
        icon: Clock,
        tint: tokens.fg2,
        discBg: hexWithAlpha(tokens.fg1, 0.1),
      }
    default:
      return {
        icon: X,
        tint: isLight ? tokens.statusBad : lightenHex(tokens.statusBad, 0.35),
        discBg: hexWithAlpha(tokens.statusBad, 0.16),
      }
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
    width: TOAST_WIDTH,
    zIndex: 10000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadowsV2.shadow3,
  },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
  },
  actionButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  actionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
})
