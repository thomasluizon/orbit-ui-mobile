import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { ClipboardList, CheckCircle2 } from 'lucide-react-native'
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

export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant: _variant = 'primary',
}: HabitListEmptyStateProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const allDoneToday = title === 'habits.allDoneToday'

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        {allDoneToday ? (
          <CheckCircle2 size={28} color={tokens.fg3} strokeWidth={1.4} />
        ) : (
          <ClipboardList size={28} color={tokens.fg3} strokeWidth={1.4} />
        )}
      </View>
      {allDoneToday ? (
        <Text style={[styles.emptyTitle, { color: tokens.fg1 }]}>{title}</Text>
      ) : null}
      <Text style={[styles.emptyDescription, { color: tokens.fg3 }]}>
        {description}
      </Text>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.actionLink,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text
            style={[
              styles.actionLinkText,
              {
                color: tokens.fg1,
                textDecorationColor: tokens.hairlineStrong,
              },
            ]}
          >
            {actionLabel}
          </Text>
        </Pressable>
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 56,
    gap: 12,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'Geist',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDescription: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 21,
  },
  actionLink: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  actionLinkText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})
