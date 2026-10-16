import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { motionDurations, motionEasings, skeletonPulseIterations } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function PendingReply({ visible }: Readonly<{ visible: boolean }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const remainingPulseTime = useRef(motionDurations.slow * 4 * skeletonPulseIterations)
  const opacity = useSharedValue(1)
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useEffect(() => {
    if (reducedMotion || !visible || remainingPulseTime.current <= 0) {
      opacity.value = 1
      return
    }
    const started = Date.now()
    const settle = setTimeout(() => {
      remainingPulseTime.current = 0
      cancelAnimation(opacity)
      opacity.value = 1
    }, remainingPulseTime.current)
    const timing = { duration: motionDurations.slow * 2, easing: Easing.bezier(...motionEasings.standard) }
    opacity.value = withRepeat(withSequence(withTiming(0.6, timing), withTiming(1, timing)), skeletonPulseIterations)
    return () => {
      clearTimeout(settle)
      remainingPulseTime.current = Math.max(0, remainingPulseTime.current - (Date.now() - started))
      cancelAnimation(opacity)
    }
  }, [opacity, reducedMotion, visible])
  const dots = [0, 1, 2].map(dot => <View key={dot} style={[styles.dot, { backgroundColor: tokens.fg2 }]} />)
  return <View testID="astra-pending" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.row}>
    {reducedMotion ? <View style={styles.dots}>{dots}</View> : <Animated.View style={[styles.dots, pulseStyle]}>{dots}</Animated.View>}
  </View>
}

const styles = StyleSheet.create({
  row: { height: 24, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
})
