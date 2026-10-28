import { useEffect, useState } from 'react'
import type { ProgressBarProps } from '@orbit/shared/contracts/display'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the bar scaleX on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  StyleSheet,
  View,
} from 'react-native'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Accent shows unfinished progress; a completed bar returns to neutral. */
export function ProgressBar({ value = 0, max = 100, label }: Readonly<ProgressBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const safeMax = max > 0 ? max : 100
  const clampedValue = Math.min(safeMax, Math.max(0, value))
  const ratio = clampedValue / safeMax
  const complete = ratio === 1
  const [scaleX] = useState(() => new Animated.Value(ratio))

  useEffect(() => {
    if (prefersReducedMotion) {
      scaleX.stopAnimation()
      scaleX.setValue(ratio)
      return
    }
    const animation = Animated.timing(scaleX, {
      toValue: ratio,
      duration: motionDurations.base,
      easing: toAnimatedEasing(motionEasings.linear),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [prefersReducedMotion, ratio, scaleX])

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: safeMax, now: clampedValue }}
      style={[styles.track, { backgroundColor: tokens.trackEmpty }]}
      testID={complete ? 'progress-bar-complete' : 'progress-bar-unfinished'}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: complete ? tokens.fg3 : tokens.primary,
            transform: [{ scaleX }],
            transformOrigin: 'left',
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: radius.full,
  },
})
