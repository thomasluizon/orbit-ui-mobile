import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { schemes } from '@orbit/shared/theme'
import { useProfile } from '@/hooks/use-profile'
import { radius, durations, gradients, primaryRgba } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ProBadgeProps {
  /**
   * When true, the badge is always rendered regardless of the user's pro/trial status.
   * Use this for UI labels that should always show the PRO badge (e.g. locked feature headers).
   */
  alwaysVisible?: boolean
  /** Additional styles applied to the outer badge container. */
  style?: ViewStyle
  /** Additional styles applied to the badge label text. */
  textStyle?: TextStyle
  /** Override the badge label. Defaults to the i18n trial/pro label. */
  label?: string
}

export function ProBadge({ alwaysVisible = false, style, textStyle, label }: ProBadgeProps) {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { colors, currentScheme } = useAppTheme()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess

  const shimmer = useSharedValue(0)
  const [pillWidth, setPillWidth] = useState(0)

  useEffect(() => {
    if (!shouldRender) return

    shimmer.value = withRepeat(
      withTiming(1, { duration: durations.shimmer, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    )

    return () => {
      cancelAnimation(shimmer)
    }
  }, [shouldRender, shimmer])

  const animatedStyle = useAnimatedStyle(() => {
    const W = pillWidth > 0 ? pillWidth : 200
    return {
      transform: [{ translateX: interpolate(shimmer.value, [0, 1], [W, -W]) }],
    }
  })

  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  const shadowRgb = schemes[currentScheme]?.shadowRgb ?? '139, 92, 246'
  const shimmerColors = gradients.proShimmer(shadowRgb)

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.primary_15,
          borderColor: primaryRgba(0.2, shadowRgb),
        },
        style,
      ]}
      onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.shimmerStrip, animatedStyle]}>
        <LinearGradient
          colors={shimmerColors}
          locations={gradients.proShimmerLocations}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Text style={[styles.text, { color: colors.primary }, textStyle]}>{badgeLabel}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    borderWidth: 1,
  },
  shimmerStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '200%',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    zIndex: 1,
  },
})
