import { useEffect, useRef, useState } from 'react'
import type { ProgressRingProps } from '@orbit/shared/contracts/display'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- WHY: RN Animated supports SVG stroke props while the pinned Reanimated ABI awaits https://github.com/thomasluizon/orbit-ui-mobile/issues/243.
  Animated,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** A circular progress sweep over a neutral track. */
export function ProgressRing({ value = 0, size = 64, label }: Readonly<ProgressRingProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const clamped = Math.min(100, Math.max(0, value))
  const complete = clamped === 100
  const strokeWidth = Math.max(2, size / 16)
  const radius = (size - strokeWidth) / 2
  const circle = useRef<Circle>(null)
  const [circumference, setCircumference] = useState(0)
  const [strokeDashoffset] = useState(() => new Animated.Value(0))
  const targetOffset = useRef<number | null>(null)
  const measure = () => {
    const length = circle.current?.getTotalLength()
    if (length === undefined) return
    const nextOffset = length * (1 - clamped / 100)
    strokeDashoffset.stopAnimation()
    strokeDashoffset.setValue(nextOffset)
    targetOffset.current = nextOffset
    setCircumference(length)
  }

  useEffect(() => {
    if (circumference === 0) return
    const nextOffset = circumference * (1 - clamped / 100)

    if (prefersReducedMotion) {
      strokeDashoffset.stopAnimation()
      strokeDashoffset.setValue(nextOffset)
      targetOffset.current = nextOffset
      return
    }
    if (targetOffset.current === nextOffset) return

    strokeDashoffset.stopAnimation()
    targetOffset.current = nextOffset
    const animation = Animated.timing(strokeDashoffset, {
      toValue: nextOffset,
      duration: motionDurations.base,
      easing: toAnimatedEasing(motionEasings.standard),
      useNativeDriver: false,
    })
    animation.start()
    return () => animation.stop()
  }, [circumference, clamped, prefersReducedMotion, strokeDashoffset])

  return (
    <Svg
      onLayout={measure}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      testID={complete ? 'progress-ring-complete' : 'progress-ring-unfinished'}
    >
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tokens.trackEmpty} strokeWidth={strokeWidth} />
      <AnimatedCircle
        ref={circle}
        opacity={circumference > 0 ? 1 : 0}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={complete ? tokens.fg3 : tokens.primary}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  )
}
