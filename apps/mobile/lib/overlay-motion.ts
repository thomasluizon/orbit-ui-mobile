import { useEffect, useState } from 'react'
import { Animated } from 'react-native'
import type { MotionScenario } from '@orbit/shared/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'

export function useOverlayMotion(open: boolean, scenario: MotionScenario) {
  const preset = useResolvedMotionPreset(scenario)
  const [progress] = useState(() => new Animated.Value(open ? 0 : 1))
  const [retained, setRetained] = useState(open)
  if (open && !retained) setRetained(true)

  useEffect(() => {
    if (preset.reducedMotionEnabled) progress.setValue(open ? 1 : 0)
    const duration = preset.reducedMotionEnabled ? 0 : open ? preset.enterDuration : preset.exitDuration
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0, duration, useNativeDriver: true,
      easing: toAnimatedEasing(open ? preset.enterEasing : preset.exitEasing),
    })
    animation.start()
    const timer = !open ? setTimeout(() => setRetained(false), duration) : undefined
    return () => { animation.stop(); clearTimeout(timer) }
  }, [open, preset.enterDuration, preset.exitDuration, preset.enterEasing, preset.exitEasing, preset.reducedMotionEnabled, progress])

  return {
    present: open || retained,
    style: {
      opacity: progress,
      transform: preset.reducedMotionEnabled ? [] : [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [preset.shift, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [preset.scaleFrom, 1] }) },
      ],
    },
  }
}
