import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  getHabitInitial,
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressStrokeDasharray,
} from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'
import { primaryRgba } from '@/lib/theme'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
  isCompleted: boolean
  isOverdue: boolean
  isBadHabit: boolean
  showArc: boolean
  progressRatio: number
  centerLabel?: string | null
  showCheckBadge?: boolean
  isDisabled?: boolean
  pulse?: boolean
  glow?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}

interface SizeTokens {
  outer: number
  inner: number
  emojiFont: number
  initialFont: number
  badge: number
  radius: number
  badgeIcon: number
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { outer: 44, inner: 40, emojiFont: 18, initialFont: 16, badge: 14, radius: 12, badgeIcon: 8 },
  md: { outer: 56, inner: 52, emojiFont: 22, initialFont: 20, badge: 18, radius: 14, badgeIcon: 10 },
}

/**
 * Mobile "Avatar + Arc" tile. Mirror of
 * apps/web/components/habits/habit-avatar-tile.tsx. Holds either the chosen
 * emoji or the title's initial fallback inside a 52 px rounded-square with
 * the primary tint at low alpha. Optional 2 px SVG arc wraps the tile when
 * the card represents a parent or flexible habit. Tap to log.
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
  isCompleted,
  isOverdue,
  isBadHabit,
  showArc,
  progressRatio,
  centerLabel,
  showCheckBadge = false,
  isDisabled = false,
  pulse = false,
  glow = false,
  onPress,
  accessibilityLabel,
}: HabitAvatarTileProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const tokens = SIZES[size]
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const innerLabel = hasIcon ? icon : initial

  const { backgroundColor, textColor, ringColor } = useMemo(() => {
    if (isCompleted) {
      return {
        backgroundColor: colors.primary,
        textColor: colors.textInverse,
        ringColor: colors.primary_30,
      }
    }
    if (isBadHabit) {
      return {
        backgroundColor: colors.red500_10,
        textColor: colors.danger,
        ringColor: isOverdue ? colors.red500_30 : colors.red500_10,
      }
    }
    return {
      backgroundColor: colors.primary_15,
      textColor: colors.primary,
      // Subtle gradient-feel border via a primary-tinted ring (was borderMuted).
      ringColor: isOverdue ? colors.red500_30 : colors.primary_20,
    }
  }, [isCompleted, isBadHabit, isOverdue, colors])

  // Animations
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

  const accessibleLabel =
    accessibilityLabel ??
    (hasIcon
      ? `${title} - ${t('habits.emojiPicker.title')}`
      : `${title} - ${t('habits.form.iconNone')}`)

  const innerTile = (
    <View
      style={[
        styles.inner,
        {
          width: tokens.inner,
          height: tokens.inner,
          borderRadius: tokens.radius,
          backgroundColor,
          borderColor: ringColor,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: hasIcon ? tokens.emojiFont : tokens.initialFont,
          color: textColor,
          fontWeight: '600',
          textAlign: 'center',
          includeFontPadding: false,
          // Slightly desaturate the emoji/initial when completed (matches web).
          opacity: isCompleted ? 0.92 : 1,
        }}
      >
        {innerLabel}
      </Text>
      {centerLabel ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: tokens.radius,
              backgroundColor,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={{ fontSize: 11, fontWeight: '700', color: textColor }}
          >
            {centerLabel}
          </Text>
        </View>
      ) : null}
    </View>
  )

  const shouldRenderArcFill = showArc && (isCompleted || progressRatio > 0)
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

  const badge = showCheckBadge ? (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          width: tokens.badge,
          height: tokens.badge,
          borderRadius: tokens.badge / 2,
          backgroundColor: colors.primary,
          borderColor: colors.surface,
        },
      ]}
    >
      <Check size={tokens.badgeIcon} color={colors.textInverse} />
    </View>
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
      {badge}
    </Animated.View>
  )

  if (typeof onPress === 'function') {
    return (
      <TouchableOpacity
        onPress={() => {
          if (isDisabled) return
          onPress?.()
        }}
        disabled={isDisabled}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        accessibilityState={{ selected: isCompleted, disabled: isDisabled }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        {body}
      </TouchableOpacity>
    )
  }

  return body
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
})
