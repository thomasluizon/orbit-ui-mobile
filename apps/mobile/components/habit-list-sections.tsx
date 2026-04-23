import type { ReactNode } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { ClipboardList, CheckCircle2 } from 'lucide-react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

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
  styles: {
    sectionInset: object
    emptyState: object
    emptyIconContainer: object
    emptySubtitle: object
    createButton: object
    createButtonText: object
  }
  colors: {
    textMuted: string
    primary: string
    textSecondary: string
  }
}

export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
  styles,
  colors,
}: HabitListEmptyStateProps) {
  const allDoneToday = title === 'habits.allDoneToday'

  return (
    <View style={styles.sectionInset}>
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          {allDoneToday ? (
            <CheckCircle2 size={40} color={colors.textMuted} />
          ) : (
            <ClipboardList size={40} color={colors.textMuted} />
          )}
        </View>
        {allDoneToday ? (
          <Text
            style={{
              color: colors.primary,
              fontSize: 18,
              fontWeight: '700',
              marginBottom: 4,
            }}
          >
            {title}
          </Text>
        ) : null}
        <Text style={styles.emptySubtitle}>{description}</Text>
        {actionLabel ? (
          <TouchableOpacity
            style={[
              styles.createButton,
              variant === 'secondary'
                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }
                : null,
            ]}
            onPress={onAction}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.createButtonText,
                variant === 'secondary' ? { color: colors.primary } : null,
              ]}
            >
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  renderHabit: (habit: NormalizedHabit, index: number) => ReactNode
  styles: {
    sectionInset: object
    groupSection: object
    groupHeader: object
    groupLabel: object
    groupLabelOverdue: object
    groupDivider: object
    groupDividerOverdue: object
    groupItems: object
    groupItem: object
  }
}

export function HabitListDateGroupSection({
  group,
  overdueLabel,
  renderHabit,
  styles,
}: HabitListDateGroupSectionProps) {
  return (
    <View style={styles.sectionInset}>
      <View style={styles.groupSection}>
        <View style={styles.groupHeader}>
          <Text
            style={[
              styles.groupLabel,
              group.isOverdue ? styles.groupLabelOverdue : null,
            ]}
          >
            {group.isOverdue ? overdueLabel : group.label}
          </Text>
          <View
            style={[
              styles.groupDivider,
              group.isOverdue ? styles.groupDividerOverdue : null,
            ]}
          />
        </View>
        <View style={styles.groupItems}>
          {group.habits.map((habit, index) => (
            <View key={habit.id} style={styles.groupItem}>
              {renderHabit(habit, index)}
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
