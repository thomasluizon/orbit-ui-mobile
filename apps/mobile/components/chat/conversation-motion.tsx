import { useEffect, useRef, type ReactNode } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, Easing, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { resolveConversationMotion } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function useConversationMotion(index = 0) {
  return resolveConversationMotion(usePrefersReducedMotion(), index)
}

export function useConversationLayout() {
  const configuration = useConversationMotion()
  return configuration.changeDuration === 0 ? undefined : LinearTransition.duration(configuration.changeDuration)
    .easing(Easing.bezier(...configuration.easing)).reduceMotion(ReduceMotion.System)
}

export function ConversationReveal({ children, animate = false, index = 0, style, accessibilityLabel }: Readonly<{
  children: ReactNode
  animate?: boolean
  index?: number
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}>) {
  const configuration = useConversationMotion(index)
  const progress = useSharedValue(animate && configuration.duration > 0 ? 0 : 1)
  const presentation = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * progress.value, transform: [{ translateY: (1 - progress.value) * configuration.shift }] }))
  useEffect(() => {
    cancelAnimation(progress)
    if (configuration.duration === 0) progress.value = 1
    else progress.value = withDelay(configuration.delay, withTiming(1, { duration: configuration.duration, easing: Easing.bezier(...configuration.easing) }))
    return () => cancelAnimation(progress)
  }, [configuration.delay, configuration.duration, configuration.easing, progress])
  return <Animated.View testID="conversation-reveal" accessibilityLabel={accessibilityLabel} style={[style, presentation]}>{children}</Animated.View>
}

export function ConversationChange({ children, changeKey, style }: Readonly<{
  children?: ReactNode
  changeKey: string
  style?: StyleProp<ViewStyle>
}>) {
  const configuration = useConversationMotion()
  const previous = useRef(changeKey)
  const opacity = useSharedValue(1)
  const presentation = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useEffect(() => {
    cancelAnimation(opacity)
    if (previous.current !== changeKey && configuration.changeDuration > 0) {
      opacity.value = 0.6
      opacity.value = withTiming(1, { duration: configuration.changeDuration, easing: Easing.bezier(...configuration.easing) })
    } else opacity.value = 1
    previous.current = changeKey
    return () => cancelAnimation(opacity)
  }, [changeKey, configuration.changeDuration, configuration.easing, opacity])
  return <Animated.View testID="conversation-change" style={[style, presentation]}>{children}</Animated.View>
}
