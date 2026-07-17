import { useEffect, useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the button transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Pressable, StyleSheet } from 'react-native'
import { ArrowUp } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings, shadowsV2, zLayers } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'

interface ScrollToTopButtonProps {
  visible: boolean
  onPress: () => void
  /** Distance in px from the bottom of the screen area (above the tab bar). */
  bottom: number
}

/**
 * Floating control that scrolls the active habit list back to the top. The parent
 * gates `visible` on scroll offset so it only appears once a long list has been
 * scrolled. Sits bottom-right above the tab bar and fades/slides in on `transform`
 * + `opacity`, collapsing to an instant cut under reduced motion.
 */
export function ScrollToTopButton({
  visible,
  onPress,
  bottom,
}: Readonly<ScrollToTopButtonProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const prefersReducedMotion = usePrefersReducedMotion()
  const anim = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: prefersReducedMotion ? 0 : 220,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start()
  }, [anim, prefersReducedMotion, visible])

  const animatedStyle = {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        }),
      },
    ],
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.wrap, { bottom }, animatedStyle]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('common.backToTop')}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          shadowsV2.shadow2,
          {
            backgroundColor: tokens.bgSheet,
            borderColor: tokens.hairlineStrong,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        <ArrowUp size={20} color={tokens.fg1} strokeWidth={2.2} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    zIndex: zLayers.sticky,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
})
