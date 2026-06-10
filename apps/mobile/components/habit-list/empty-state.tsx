import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'primary' | 'secondary'
}

/**
 * v8 empty state: italic title, optional distinct description, optional Astra
 * primary pill or quiet underline link. Mirrors the web habit-list empty state.
 */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
}: HabitListEmptyStateProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription = Boolean(description) && description !== title

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: tokens.fg2 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text>
      ) : null}
      {actionLabel ? (
        isAstraPrompt ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [
              styles.primaryAction,
              { backgroundColor: tokens.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryActionText, { color: tokens.fgOnPrimary }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : (
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
      ) : null}
    </View>
  )
}

interface SkeletonCardStyles {
  skeletonCard: StyleProp<ViewStyle>
  skeletonCircle: StyleProp<ViewStyle>
  skeletonContent: StyleProp<ViewStyle>
  skeletonTitle: StyleProp<ViewStyle>
  skeletonSubtitle: StyleProp<ViewStyle>
}

export function SkeletonCard({ styles: cardStyles }: { styles: SkeletonCardStyles }) {
  return (
    <View style={cardStyles.skeletonCard}>
      <View style={cardStyles.skeletonCircle} />
      <View style={cardStyles.skeletonContent}>
        <View style={cardStyles.skeletonTitle} />
        <View style={cardStyles.skeletonSubtitle} />
      </View>
    </View>
  )
}

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
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 16,
  },
  title: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 17,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  primaryAction: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  primaryActionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    },
  linkAction: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  linkActionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
