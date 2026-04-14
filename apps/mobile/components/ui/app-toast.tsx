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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '@/lib/use-app-theme'
import { radius } from '@/lib/theme'
import { useAppToastStore } from '@/stores/app-toast-store'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOAST_WIDTH = Math.min(SCREEN_WIDTH - 32, 420)
const TOAST_DURATION_MS = 4500
const ACTION_TOAST_DURATION_MS = 6000

export function AppToast() {
  const insets = useSafeAreaInsets()
  const { colors, shadows } = useAppTheme()
  const currentToast = useAppToastStore((state) => state.currentToast)
  const dismissToast = useAppToastStore((state) => state.dismissToast)
  const triggerAction = useAppToastStore((state) => state.triggerAction)
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const translateY = useRef(new Animated.Value(-48)).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.96)).current
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
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 80,
        friction: 12,
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

  const variantConfig = getVariantConfig(currentToast.variant, colors)
  const Icon = variantConfig.icon

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
      <Pressable style={styles.toast} onPress={hideToast}>
        <View style={[styles.iconWrap, { backgroundColor: variantConfig.iconBackground }]}>
          <Icon size={18} color={variantConfig.iconColor} />
        </View>
        <View style={styles.messageWrap}>
          <Text style={styles.message}>{currentToast.message}</Text>
          {currentToast.actionLabel ? (
            <Pressable onPress={triggerAction} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: variantConfig.actionColor }]}>
                {currentToast.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
      width: TOAST_WIDTH,
      zIndex: 10000,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: 18,
      paddingVertical: 15,
      ...shadows.lg,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    messageWrap: {
      flex: 1,
      gap: 10,
    },
    message: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    actionButton: {
      alignSelf: 'flex-start',
    },
    actionText: {
      fontSize: 13,
      fontWeight: '700',
    },
  })
}

function getVariantConfig(
  variant: ReturnType<typeof useAppToastStore.getState>['currentToast'] extends infer T
    ? T extends { variant: infer V }
      ? V
      : never
    : never,
  colors: ReturnType<typeof useAppTheme>['colors'],
) {
  switch (variant) {
    case 'success':
      return {
        icon: CheckCircle2,
        iconColor: colors.green400,
        iconBackground: colors.emerald400_10,
        actionColor: colors.green400,
      }
    case 'info':
      return {
        icon: Info,
        iconColor: colors.primary,
        iconBackground: colors.primary_10,
        actionColor: colors.primary,
      }
    case 'queued':
      return {
        icon: Clock3,
        iconColor: colors.amber400,
        iconBackground: 'rgba(245, 158, 11, 0.10)',
        actionColor: colors.amber400,
      }
    default:
      return {
        icon: AlertCircle,
        iconColor: colors.red400,
        iconBackground: colors.red500_10,
        actionColor: colors.red400,
      }
  }
}
