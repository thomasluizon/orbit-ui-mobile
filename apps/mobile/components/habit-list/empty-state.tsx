import { useEffect, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
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
import { EmptyState, type EmptyStateAction } from '@/components/ui/empty-state'
import { PillButton } from '@/components/ui/pill-button'
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
 * The habit-list empty surface (Today / all / general, both all-done and
 * no-habits), rendered through the shared EmptyState lockup. The primary
 * variant stacks an Ask-Astra pill over a ghost create pill; the secondary
 * variant shows a single ghost action. Mirrors the web habit-list empty state.
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

  let action: EmptyStateAction | undefined
  let footer: ReactNode

  if (isAstraPrompt && askAstraLabel && onAskAstra) {
    action = {
      label: askAstraLabel,
      onPress: onAskAstra,
      leading: <AstraMark size={18} color={tokens.fgOnPrimary} />,
    }
    if (actionLabel) {
      footer = (
        <PillButton
          variant="ghost"
          onPress={onAction}
          accessibilityLabel={actionLabel}
          leading={<Plus size={18} color={tokens.fg1} strokeWidth={1.8} />}
        >
          {actionLabel}
        </PillButton>
      )
    }
  } else if (actionLabel) {
    action = {
      label: actionLabel,
      onPress: onAction,
      variant: 'secondary',
      leading: isAstraPrompt ? <Plus size={18} color={tokens.fg1} strokeWidth={1.8} /> : undefined,
    }
  }

  return (
    <EmptyState
      title={title}
      description={hasDistinctDescription ? description : undefined}
      action={action}
      footer={footer}
    />
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
