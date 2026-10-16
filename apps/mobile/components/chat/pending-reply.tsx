import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { Animated as NativeAnimated, StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { motionDurations, motionEasings, skeletonPulseIterations } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface PendingReplyHandle {
  setVisible: (visible: boolean) => void
}

export function PendingReply({ ref }: Readonly<{ ref: Ref<PendingReplyHandle> }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const remainingPulseTime = useRef(motionDurations.slow * 4 * skeletonPulseIterations)
  const visible = useRef(true)
  const visibility = useMemo(() => new NativeAnimated.Value(1), [])
  const updatePulseRef = useRef<(visible: boolean) => void>(() => {})
  const opacity = useSharedValue(1)
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useImperativeHandle(ref, () => ({
    setVisible(nextVisible) {
      if (visible.current === nextVisible) return
      visible.current = nextVisible
      visibility.setValue(nextVisible ? 1 : 0)
      updatePulseRef.current(nextVisible)
    },
  }), [visibility])
  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined
    let started: number | null = null
    const stopPulse = () => {
      clearTimeout(settle)
      if (started !== null) {
        remainingPulseTime.current = Math.max(0, remainingPulseTime.current - (Date.now() - started))
        started = null
      }
      cancelAnimation(opacity)
    }
    const updatePulse = (visible: boolean) => {
      stopPulse()
      opacity.value = 1
      if (reducedMotion || !visible || remainingPulseTime.current <= 0) return
      started = Date.now()
      settle = setTimeout(() => {
        remainingPulseTime.current = 0
        cancelAnimation(opacity)
        opacity.value = 1
      }, remainingPulseTime.current)
      const timing = { duration: motionDurations.slow * 2, easing: Easing.bezier(...motionEasings.standard) }
      opacity.value = withRepeat(withSequence(withTiming(0.6, timing), withTiming(1, timing)), skeletonPulseIterations)
    }
    updatePulseRef.current = updatePulse
    updatePulse(visible.current)
    return () => {
      updatePulseRef.current = () => {}
      stopPulse()
    }
  }, [opacity, reducedMotion])
  const dots = [0, 1, 2].map(dot => <View key={dot} style={[styles.dot, { backgroundColor: tokens.fg2 }]} />)
  return <View testID="astra-pending" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.row}>
    <NativeAnimated.View style={{ opacity: visibility }}>
      {reducedMotion ? <View style={styles.dots}>{dots}</View> : <Animated.View style={[styles.dots, pulseStyle]}>{dots}</Animated.View>}
    </NativeAnimated.View>
  </View>
}

const styles = StyleSheet.create({
  row: { height: 24, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
})
