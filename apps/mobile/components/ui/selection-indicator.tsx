import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export interface SelectionBounds { x: number; y: number; width: number; height: number }

export function SelectionIndicator({ bounds, color, radius = 8, borderColor }: Readonly<{
  bounds?: SelectionBounds
  color: string
  radius?: number
  borderColor?: string
}>) {
  const reduced = usePrefersReducedMotion()
  if (!bounds) return null
  return <Animated.View pointerEvents="none" accessible={false} testID="selection-motion-indicator"
    style={{ position: 'absolute', left: 0, top: 0, width: bounds.width, height: bounds.height,
      borderRadius: radius, backgroundColor: color, borderColor, borderWidth: borderColor ? 2 : 0,
      transform: [{ translateX: bounds.x }, { translateY: bounds.y }],
      transition: `transform ${reduced ? 0 : motionDurations.fast}ms cubic-bezier(${motionEasings.standard.join(',')})` }} />
}
