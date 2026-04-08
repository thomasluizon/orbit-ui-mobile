import type { ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import type { Goal } from '@orbit/shared/types/goal'
import type { ThemeContextValue } from '@/lib/theme-provider'

type AppColors = ThemeContextValue['colors']

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  title: string
  entries: GoalProgressHistoryEntry[]
  formatDate: (dateStr: string) => string
  renderEntryLabel: (entry: GoalProgressHistoryEntry) => string
  styles: Record<string, object>
}

export function GoalProgressHistorySection({
  title,
  entries,
  formatDate,
  renderEntryLabel,
  styles,
}: Readonly<GoalProgressHistorySectionProps>) {
  if (entries.length === 0) {
    return null
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.historyList}>
        {entries.map((entry) => (
          <View
            key={`${entry.createdAtUtc}-${entry.value}`}
            style={styles.historyEntry}
          >
            <View style={styles.historyEntryLeft}>
              <Text style={styles.historyEntryValue}>
                {renderEntryLabel(entry)}
              </Text>
              {entry.note && (
                <Text style={styles.historyEntryNote}>{entry.note}</Text>
              )}
            </View>
            <Text style={styles.historyEntryDate}>
              {formatDate(entry.createdAtUtc)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
  styles: Record<string, object>
}

export function GoalLinkedHabitsSection({
  title,
  linkedHabits,
  styles,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  if (linkedHabits.length === 0) {
    return null
  }

  return (
    <View style={styles.linkedHabitsSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.linkedHabitsList}>
        {linkedHabits.map((habit) => (
          <View key={habit.id} style={styles.linkedHabitChip}>
            <Text style={styles.linkedHabitText}>{habit.title}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

interface GoalActionButtonProps {
  icon: ReactNode
  label: string
  onPress: () => void
  color: string
  styles: Record<string, object>
  disabled?: boolean
}

export function GoalActionButton({
  icon,
  label,
  onPress,
  color,
  styles,
  disabled = false,
}: Readonly<GoalActionButtonProps>) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        disabled ? styles.buttonDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {icon}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}
