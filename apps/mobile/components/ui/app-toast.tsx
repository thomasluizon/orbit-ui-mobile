import { useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { AlertCircle, CheckCircle2, Clock3, Info } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toAnimatedEasing } from '@/lib/motion'
import { createTokensV2, easings, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAppToastStore } from '@/stores/app-toast-store'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 420)
const TOAST_DURATION_MS = 4500
const ACTION_TOAST_DURATION_MS = 6000

type Variant = 'success' | 'error' | 'info' | 'queued'

interface VariantStyle {
  icon: LucideIcon
  accent: string
  eyebrow: string
}

/**
 * v8 AppToast: 4 kinds (success / error / info / queued · undo) with a colored
 * left stripe, hairline ring, and uppercase mono eyebrow. Preserves the
 * existing store contract.
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

  const variantStyle = getVariantStyle(currentToast.variant, tokens)
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
            backgroundColor: tokens.bgElev,
            borderColor: tokens.hairline,
          },
        ]}
        onPress={hideToast}
      >
        <View
          style={[styles.stripe, { backgroundColor: variantStyle.accent }]}
        />
        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Icon size={16} color={variantStyle.accent} strokeWidth={1.6} />
          </View>
          <View style={styles.messageWrap}>
            <Text style={[styles.eyebrow, { color: tokens.fg3 }]}>
              {variantStyle.eyebrow}
            </Text>
            <Text style={[styles.message, { color: tokens.fg1 }]}>
              {currentToast.message}
            </Text>
          </View>
          {currentToast.actionLabel ? (
            <Pressable onPress={triggerAction} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: tokens.fg1 }]}>
                {currentToast.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

function getVariantStyle(variant: Variant, tokens: AppTokensV2): VariantStyle {
  switch (variant) {
    case 'success':
      return {
        icon: CheckCircle2,
        accent: tokens.statusDone,
        eyebrow: 'Created',
      }
    case 'info':
      return {
        icon: Info,
        accent: tokens.primary,
        eyebrow: 'Heads up',
      }
    case 'queued':
      return {
        icon: Clock3,
        accent: tokens.statusSkip,
        eyebrow: 'Queued',
      }
    default:
      return {
        icon: AlertCircle,
        accent: tokens.statusOverdue,
        eyebrow: 'Error',
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
    alignItems: 'stretch',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    ...shadowsV2.shadow2,
  },
  stripe: {
    width: 3,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageWrap: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    },
  actionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  actionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
