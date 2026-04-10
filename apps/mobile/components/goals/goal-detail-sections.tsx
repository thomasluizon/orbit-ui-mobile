import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import type { Goal } from '@orbit/shared/types/goal'
import type { ThemeContextValue } from '@/lib/theme-provider'

type AppColors = ThemeContextValue['colors']

const HISTORY_PREVIEW_COUNT = 3

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
  showAllLabel: string
  showLessLabel: string
  primaryColor: string
  styles: Record<string, object>
}

export function GoalProgressHistorySection({
  title,
  entries,
  formatDate,
  renderEntryLabel,
  showAllLabel,
  showLessLabel,
  primaryColor,
  styles,
}: Readonly<GoalProgressHistorySectionProps>) {
  const [showAllHistory, setShowAllHistory] = useState(false)

  const visibleEntries = useMemo(
    () => (showAllHistory ? entries : entries.slice(-HISTORY_PREVIEW_COUNT)),
    [entries, showAllHistory],
  )

  if (entries.length === 0) {
    return null
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.historyList}>
        {visibleEntries.map((entry) => (
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
      {entries.length > HISTORY_PREVIEW_COUNT && (
        <TouchableOpacity
          onPress={() => setShowAllHistory((prev) => !prev)}
          activeOpacity={0.7}
          style={{ marginTop: 8 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: primaryColor }}>
            {showAllHistory
              ? showLessLabel
              : `${showAllLabel} (${entries.length})`}
          </Text>
        </TouchableOpacity>
      )}
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
