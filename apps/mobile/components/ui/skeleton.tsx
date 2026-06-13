import { useEffect, useMemo } from 'react'
import {
  Animated,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

function usePulseOpacity() {
  const opacity = useMemo(() => new Animated.Value(1), [])
  const prefersReducedMotion = usePrefersReducedMotion()
  useEffect(() => {
    if (prefersReducedMotion) {
      opacity.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity, prefersReducedMotion])
  return opacity
}

function skeletonFillFromFg(fg1Hex: string): string {
  const normalized = fg1Hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, 0.06)`
}

interface SkeletonLineProps {
  width?: DimensionValue
  height?: number
  style?: StyleProp<ViewStyle>
}

/** Loading placeholder line: fg-1 6% tint block with a calm opacity pulse, no gradient shimmer. */
export function SkeletonLine({ width = '100%', height = 12, style }: Readonly<SkeletonLineProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const opacity = usePulseOpacity()
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius.md,
          backgroundColor: skeletonFillFromFg(tokens.fg1),
          opacity,
        },
        style,
      ]}
    />
  )
}
