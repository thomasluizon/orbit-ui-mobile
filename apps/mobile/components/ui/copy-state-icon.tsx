import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { motionDurations } from '@orbit/shared/theme'
import { Check, Copy } from '@/components/ui/icons'
import { toCssTransition, usePrefersReducedMotion } from '@/lib/motion'

const iconSwapTransition = toCssTransition(['opacity', 'transform', 'filter'], motionDurations.fast)

function iconSwapStyle(visible: boolean, reducedMotion: boolean) {
  const settled = visible || reducedMotion
  return {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: visible ? 1 : 0,
    transform: [{ scale: settled ? 1 : 0.25 }],
    filter: [{ blur: settled ? 0 : 4 }],
    transition: reducedMotion ? 'none' : iconSwapTransition,
  } as const
}

/** Copy glyph that cross-fades to Check with the DESIGN.md icon swap; reduced motion swaps at once. */
export function CopyStateIcon({ copied, color, strokeWidth }: Readonly<{ copied: boolean; color: string; strokeWidth: number }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <View style={{ width: 20, height: 20 }}>
    <Animated.View testID="copy-icon" style={iconSwapStyle(!copied, reducedMotion)}><Copy accessible={false} size={20} color={color} strokeWidth={strokeWidth} /></Animated.View>
    <Animated.View testID="check-icon" style={iconSwapStyle(copied, reducedMotion)}><Check accessible={false} size={20} color={color} strokeWidth={strokeWidth} /></Animated.View>
  </View>
}
