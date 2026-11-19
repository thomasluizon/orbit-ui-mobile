import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Easing } from 'react-native'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const HOP_HEIGHT = 12

/** The one hop of Orbit, for the result dialog and the four celebration triggers. It plays once when `active` turns true, and reduced motion keeps Orbit still. */
export function OrbitHop({ active, testID, children }: Readonly<{ active: boolean; testID?: string; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  const [offset] = useState(() => new Animated.Value(0))
  const hop = active && !reducedMotion
  useEffect(() => {
    if (!hop) return undefined
    const half = motionDurations.slow / 2
    const easing = Easing.bezier(...motionEasings.standard)
    const animation = Animated.sequence([
      Animated.timing(offset, { toValue: -HOP_HEIGHT, duration: half, easing, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 0, duration: half, easing, useNativeDriver: true }),
    ])
    animation.start()
    return () => {
      animation.stop()
      offset.setValue(0)
    }
  }, [hop, offset])
  return (
    <Animated.View testID={testID} data-orbit-hop={hop ? 'play' : 'still'} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ transform: [{ translateY: offset }] }}>
      {children}
    </Animated.View>
  )
}
