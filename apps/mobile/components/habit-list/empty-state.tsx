import { useEffect, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Plus } from '@/components/ui/icons'
import { AstraMark } from '@/components/ui/astra-avatar'
import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  askAstraLabel?: string
  onAskAstra?: () => void
  variant?: 'primary' | 'secondary'
}

/**
 * InicioEmpty kit state: 104px satellite glyph, 22/500 title, 15 fg-2 body,
 * then a stacked full-width Astra pill + ghost create pill. Mirrors the web
 * habit-list empty state.
 */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription = Boolean(description) && description !== title
  const showAstraAction =
    isAstraPrompt && Boolean(askAstraLabel) && Boolean(onAskAstra)
  const showStackedActions =
    showAstraAction || (isAstraPrompt && Boolean(actionLabel))

  let emptyActions: ReactNode = null
  if (showStackedActions) {
    emptyActions = (
      <View style={styles.actions}>
        {showAstraAction ? (
          <PillButton
            fullWidth
            onPress={onAskAstra}
            leading={
              <AstraMark size={18} color={tokens.fgOnPrimary} />
            }
          >
            {askAstraLabel}
          </PillButton>
        ) : null}
        {actionLabel ? (
          <PillButton
            variant="ghost"
            fullWidth
            onPress={onAction}
            leading={<Plus size={18} color={tokens.fg1} strokeWidth={1.8} />}
          >
            {actionLabel}
          </PillButton>
        ) : null}
      </View>
    )
  } else if (actionLabel) {
    emptyActions = (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={({ pressed }) => [styles.linkAction, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text
          style={[
            styles.linkActionText,
            { color: tokens.fg1, textDecorationColor: tokens.hairlineStrong },
          ]}
        >
          {actionLabel}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <SatelliteGlyph size={104} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg2 }]}>{description}</Text>
      ) : null}
      {emptyActions}
    </View>
  )
}

interface SkeletonCardStyles {
  skeletonCard: StyleProp<ViewStyle>
  skeletonCircle: StyleProp<ViewStyle>
  skeletonContent: StyleProp<ViewStyle>
  skeletonTitle: StyleProp<ViewStyle>
  skeletonSubtitle: StyleProp<ViewStyle>
  skeletonCheck: StyleProp<ViewStyle>
}

export function SkeletonCard({ styles: cardStyles }: Readonly<{ styles: SkeletonCardStyles }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (prefersReducedMotion) return
    pulse.value = withRepeat(withTiming(0.55, { duration: 550 }), -1, true)
    return () => {
      cancelAnimation(pulse)
      pulse.value = 1
    }
  }, [prefersReducedMotion, pulse])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <Animated.View style={[cardStyles.skeletonCard, pulseStyle]}>
      <View style={cardStyles.skeletonCircle} />
      <View style={cardStyles.skeletonContent}>
        <View style={cardStyles.skeletonTitle} />
        <View style={cardStyles.skeletonSubtitle} />
      </View>
      <View style={cardStyles.skeletonCheck} />
    </Animated.View>
  )
}

// react-doctor-disable-next-line only-export-components -- co-located empty-state message helper dedicated to this module; Fast Refresh dev-only, no runtime effect https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 64,
    gap: 16,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 22.5,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    marginTop: 8,
    alignSelf: 'stretch',
    gap: 12,
  },
  linkAction: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  linkActionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
