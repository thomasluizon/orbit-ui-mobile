import { useEffect, useRef, useState, type ReactNode } from 'react'
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
    if (!animate || configuration.duration === 0) progress.value = 1
    else progress.value = withDelay(configuration.delay, withTiming(1, { duration: configuration.duration, easing: Easing.bezier(...configuration.easing) }))
    return () => cancelAnimation(progress)
  }, [animate, configuration.delay, configuration.duration, configuration.easing, progress])
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

function DepartingSnapshot({ children }: Readonly<{ children: ReactNode }>) {
  const configuration = useConversationMotion()
  const opacity = useSharedValue(1)
  const presentation = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useEffect(() => {
    opacity.value = withTiming(0, { duration: configuration.changeDuration, easing: Easing.bezier(...configuration.easing) })
    return () => cancelAnimation(opacity)
  }, [configuration.changeDuration, configuration.easing, opacity])
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, presentation]}>{children}</Animated.View>
}

export function ConversationCrossfade({ children, changeKey }: Readonly<{ children: ReactNode; changeKey: string }>) {
  const configuration = useConversationMotion()
  const [snapshot, setSnapshot] = useState({ key: changeKey, children, previous: null as ReactNode })
  if (snapshot.key !== changeKey) setSnapshot({ key: changeKey, children, previous: snapshot.children })
  else if (snapshot.children !== children) setSnapshot({ ...snapshot, children })
  useEffect(() => {
    if (!snapshot.previous) return
    const timer = setTimeout(() => setSnapshot(current => ({ ...current, previous: null })), configuration.changeDuration)
    return () => clearTimeout(timer)
  }, [snapshot.key, snapshot.previous, configuration.changeDuration])
  return <Animated.View style={{ minWidth: 0 }}>
    <ConversationChange changeKey={changeKey}>{children}</ConversationChange>
    {snapshot.previous && configuration.changeDuration > 0 ? <DepartingSnapshot key={snapshot.key}>{snapshot.previous}</DepartingSnapshot> : null}
  </Animated.View>
}
