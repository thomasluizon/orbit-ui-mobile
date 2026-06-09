import { useEffect, useMemo } from 'react'
import {
  Animated,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function usePulseOpacity() {
  const opacity = useMemo(() => new Animated.Value(1), [])
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return opacity
}

interface SkeletonLineProps {
  width?: DimensionValue
  height?: number
  style?: StyleProp<ViewStyle>
}

/** v8 loading placeholder line: calm opacity pulse, no gradient shimmer. */
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
        { width, height, borderRadius: radius.sm, backgroundColor: tokens.bgElev, opacity },
        style,
      ]}
    />
  )
}

