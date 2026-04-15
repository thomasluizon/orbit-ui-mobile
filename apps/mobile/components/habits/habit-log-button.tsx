import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { Check } from 'lucide-react-native'
import {
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressStrokeDasharray,
} from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'
import { primaryRgba } from '@/lib/theme'

type HabitLogButtonSize = 'sm' | 'md'

interface HabitLogButtonProps {
  size?: HabitLogButtonSize
  isCompleted: boolean
  isOverdue: boolean
  isBadHabit: boolean
  showArc: boolean
  progressRatio: number
  centerLabel?: string | null
  isDisabled?: boolean
  pulse?: boolean
  glow?: boolean
  onPress: () => void
  accessibilityLabel: string
}

interface SizeTokens {
  outer: number
  inner: number
  radius: number
  checkSize: number
  labelFont: number
}

const SIZES: Record<HabitLogButtonSize, SizeTokens> = {
  sm: { outer: 44, inner: 40, radius: 12, checkSize: 18, labelFont: 11 },
  md: { outer: 56, inner: 52, radius: 14, checkSize: 22, labelFont: 13 },
}

/**
 * Mobile counterpart to `HabitLogButton` on web. Interactive log/finalize
 * button that sits left of each habit card. Handles:
 *   - Simple habits: tap to log; solid primary check when completed.
 *   - Parent-with-children: shows `x/n` center label + progress arc.
 *   - Flexible habits: progress arc only.
 *
 * The decorative emoji identity is rendered separately by
 * {@link HabitAvatarTile}.
 */
export function HabitLogButton({
  size = 'md',
  isCompleted,
  isOverdue,
  isBadHabit,
  showArc,
  progressRatio,
  centerLabel,
  isDisabled = false,
  pulse = false,
  glow = false,
  onPress,
  accessibilityLabel,
}: Readonly<HabitLogButtonProps>) {
  const { colors } = useAppTheme()
  const tokens = SIZES[size]

  const { backgroundColor, contentColor, borderColor } = resolveSurface({
    isCompleted,
    isBadHabit,
    isOverdue,
    colors,
  })

  // Pulse / glow
  const pulseScale = useSharedValue(1)
  const glowOpacity = useSharedValue(0)
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }))
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }))

  if (pulse) {
    pulseScale.value = withSequence(
      withTiming(1.08, { duration: 180 }),
      withTiming(1, { duration: 240 }),
    )
  }
  if (glow) {
    glowOpacity.value = withSequence(
      withTiming(0.6, { duration: 300 }),
      withTiming(0, { duration: 1100 }),
    )
  }

  const arcDasharray = getHabitProgressStrokeDasharray(
    progressRatio * 100,
    isCompleted,
  )
  const shouldRenderArcFill = showArc && (isCompleted || progressRatio > 0)

  const innerTile = (
    <View
      style={[
        styles.inner,
        {
          width: tokens.inner,
          height: tokens.inner,
          borderRadius: tokens.radius,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      {renderContent({
        isCompleted,
        centerLabel,
        color: contentColor,
        checkSize: tokens.checkSize,
        labelFont: tokens.labelFont,
      })}
    </View>
  )

  const arc = shouldRenderArcFill ? (
    <Svg
      width={tokens.outer}
      height={tokens.outer}
      viewBox="0 0 36 36"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: [{ rotate: '-90deg' }],
      }}
      pointerEvents="none"
    >
      <Circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke={isCompleted || progressRatio === 1 ? colors.primary : primaryRgba(0.7)}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={arcDasharray}
        strokeDashoffset={(HABIT_PROGRESS_RING_CIRCUMFERENCE / 4).toFixed(2)}
      />
    </Svg>
  ) : null

  const body = (
    <Animated.View
      style={[
        {
          width: tokens.outer,
          height: tokens.outer,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        pulseStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: 18,
            backgroundColor: primaryRgba(0.18),
          },
          glowStyle,
        ]}
      />
      {arc}
      {innerTile}
    </Animated.View>
  )

  return (
    <TouchableOpacity
      onPress={() => {
        if (isDisabled) return
        onPress()
      }}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isCompleted, disabled: isDisabled }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {body}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SurfaceColors {
  primary: string
  textInverse: string
  primary_15: string
  primary_20: string
  primary_30: string
  red500_10: string
  red500_30: string
  danger: string
}

function resolveSurface({
  isCompleted,
  isBadHabit,
  isOverdue,
  colors,
}: Readonly<{
  isCompleted: boolean
  isBadHabit: boolean
  isOverdue: boolean
  colors: SurfaceColors
}>) {
  if (isCompleted) {
    return {
      backgroundColor: colors.primary,
      contentColor: colors.textInverse,
      borderColor: colors.primary_30,
    }
  }
  if (isBadHabit) {
    return {
      backgroundColor: colors.red500_10,
      contentColor: colors.danger,
      borderColor: isOverdue ? colors.red500_30 : colors.red500_10,
    }
  }
  return {
    backgroundColor: colors.primary_15,
    contentColor: colors.primary,
    borderColor: isOverdue ? colors.red500_30 : colors.primary_20,
  }
}

function renderContent({
  isCompleted,
  centerLabel,
  color,
  checkSize,
  labelFont,
}: Readonly<{
  isCompleted: boolean
  centerLabel: string | null | undefined
  color: string
  checkSize: number
  labelFont: number
}>) {
  if (isCompleted) {
    return <Check size={checkSize} color={color} strokeWidth={2.5} />
  }
  if (centerLabel) {
    return (
      <Text
        allowFontScaling={false}
        style={{
          fontSize: labelFont,
          fontWeight: '700',
          color,
          includeFontPadding: false,
        }}
      >
        {centerLabel}
      </Text>
    )
  }
  return null
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
})
