import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ClipboardList, CheckCircle2 } from 'lucide-react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { SectionLabel } from '@/components/ui/section-label'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface HabitListDateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

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

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  renderHabit: (habit: NormalizedHabit, index: number) => ReactNode
}

export function HabitListDateGroupSection({
  group,
  overdueLabel,
  renderHabit,
}: HabitListDateGroupSectionProps) {
  return (
    <View>
      <SectionLabel top={20} bottom={8}>
        {group.isOverdue ? overdueLabel : group.label}
      </SectionLabel>
      {group.habits.map((habit, index) => (
        <View key={habit.id}>{renderHabit(habit, index)}</View>
      ))}
    </View>
  )
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
