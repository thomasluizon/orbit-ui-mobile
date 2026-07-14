import { useEffect, useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver spins the avatar on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { LucideProps } from 'lucide-react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

const RING_RADIUS = 8.25
const CORE_RADIUS = 3
const SATELLITE_RADIUS = 1.9
const SATELLITE_X = 17.83
const SATELLITE_Y = 6.17
const TRAIL_PATH = 'M9.18 4.24 A8.25 8.25 0 0 1 17.83 6.17'
const ORBIT_DURATION_MS = 14000

interface AstraMarkProps extends LucideProps {
  /** Slowly orbit the satellite around the core (reduced-motion gated). */
  animate?: boolean
}

/**
 * Astra's identity glyph: a violet core with a single satellite tracing a hairline orbit.
 * Token-driven and `LucideProps`-compatible, so it drops into icon slots like a lucide icon.
 * Passing `color` renders it monochrome (icon contexts); omitting it keeps the violet/hairline duotone.
 */
export function AstraMark({
  size = 24,
  color,
  strokeWidth = 1.8,
  animate = false,
}: Readonly<AstraMarkProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const prefersReducedMotion = usePrefersReducedMotion()
  const dimension = typeof size === 'number' ? size : Number(size)
  const stroke = typeof strokeWidth === 'number' ? strokeWidth : Number(strokeWidth)
  const monochrome = color != null
  const ringColor = monochrome ? color : tokens.fg4
  const accentColor = monochrome ? color : tokens.primary

  const spin = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (!animate || prefersReducedMotion) {
      spin.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: ORBIT_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [animate, prefersReducedMotion, spin])

  return (
    <Animated.View
      style={{
        width: dimension,
        height: dimension,
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    >
      <Svg width={dimension} height={dimension} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={12}
          r={RING_RADIUS}
          stroke={ringColor}
          strokeWidth={stroke}
          opacity={monochrome ? 0.45 : 1}
        />
        <Path d={TRAIL_PATH} stroke={accentColor} strokeWidth={stroke} strokeLinecap="round" />
        <Circle cx={SATELLITE_X} cy={SATELLITE_Y} r={SATELLITE_RADIUS} fill={accentColor} />
        <Circle cx={12} cy={12} r={CORE_RADIUS} fill={accentColor} />
      </Svg>
    </Animated.View>
  )
}

interface AstraAvatarProps {
  /** Disc diameter in px. */
  size?: number
  /** Accessible name. When omitted the avatar is decorative (hidden from assistive tech). */
  label?: string
  /** Slowly orbit the satellite (reduced-motion gated). */
  animate?: boolean
  style?: StyleProp<ViewStyle>
}

/** Astra's avatar: the orbital mark centered on a primary-tinted disc, for hero and chat-bubble use. */
export function AstraAvatar({ size = 116, label, animate = false, style }: Readonly<AstraAvatarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const decorative = label == null

  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={label}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tintFromPrimary(tokens, 0.14),
        },
        style,
      ]}
    >
      <AstraMark size={Math.round(size * 0.5)} animate={animate} />
    </View>
  )
}
