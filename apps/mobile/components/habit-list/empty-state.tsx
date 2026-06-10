import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
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
 * Kit empty state: satellite glyph, title, optional distinct description, optional
 * Astra primary pill or quiet underline link. Mirrors the web habit-list empty state.
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
      <SatelliteGlyph size={96} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text>
      ) : null}
      {actionLabel ? (
        isAstraPrompt ? (
          <PillButton onPress={onAction} style={styles.primaryAction}>
            {actionLabel}
          </PillButton>
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
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
    marginTop: 18,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
  },
  primaryAction: {
    marginTop: 22,
  },
  linkAction: {
    marginTop: 22,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  linkActionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
