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

interface SkeletonCardProps {
  lines?: number
  style?: StyleProp<ViewStyle>
}

/** v8 loading placeholder card: hairline-outlined elevated block with pulsing lines. */
export function SkeletonCard({ lines = 3, style }: Readonly<SkeletonCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  return (
    <Animated.View
      style={[
        {
          backgroundColor: tokens.bgElev,
          borderColor: tokens.hairline,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: 20,
          gap: 12,
        },
        style,
      ]}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine
          key={index}
          height={index === 0 ? 16 : 12}
          width={index === 0 ? '33%' : index === lines - 1 ? '66%' : '100%'}
        />
      ))}
    </Animated.View>
  )
}

const AVATAR_SIZES = { sm: 32, md: 40, lg: 56 } as const

interface SkeletonAvatarProps {
  size?: keyof typeof AVATAR_SIZES
  style?: StyleProp<ViewStyle>
}

/** v8 circular loading placeholder for an avatar or icon slot. */
export function SkeletonAvatar({ size = 'md', style }: Readonly<SkeletonAvatarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const opacity = usePulseOpacity()
  const dimension = AVATAR_SIZES[size]
  return (
    <Animated.View
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: tokens.bgElev,
          opacity,
        },
        style,
      ]}
    />
  )
}
