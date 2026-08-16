import { useState, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Repeat } from '@/components/ui/icons'
import type { Goal } from '@orbit/shared/types/goal'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const HISTORY_PREVIEW_COUNT = 3

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  entries: GoalProgressHistoryEntry[]
  formatDate: (dateStr: string) => string
  renderEntryLabel: (entry: GoalProgressHistoryEntry) => string
  showAllLabel: string
  showLessLabel: string
}

export function GoalProgressHistorySection({
  entries,
  formatDate,
  renderEntryLabel,
  showAllLabel,
  showLessLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [showAllHistory, setShowAllHistory] = useState(false)

  const visibleEntries = useMemo(
    () => (showAllHistory ? entries : entries.slice(-HISTORY_PREVIEW_COUNT)),
    [entries, showAllHistory],
  )

  if (entries.length === 0) return null

  return (
    <View>
      {visibleEntries.map((entry) => (
        <View
          key={`${entry.createdAtUtc}-${entry.value}`}
          style={styles.historyEntry}
        >
          <View style={styles.historyEntryHeader}>
            <Text style={styles.historyDate}>
              {formatDate(entry.createdAtUtc)}
            </Text>
            <Text style={styles.historyValue}>{renderEntryLabel(entry)}</Text>
          </View>
          {entry.note ? (
            <Text style={styles.historyNote}>{entry.note}</Text>
          ) : null}
        </View>
      ))}
      {entries.length > HISTORY_PREVIEW_COUNT ? (
        <Pressable
          onPress={() => setShowAllHistory((prev) => !prev)}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.toggleAll,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={showAllHistory ? showLessLabel : showAllLabel}
        >
          <Text style={styles.toggleAllText}>
            {showAllHistory
              ? showLessLabel
              : `${showAllLabel} (${entries.length})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
}

export function GoalLinkedHabitsSection({
  title,
  linkedHabits,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  if (linkedHabits.length === 0) return null

  return (
    <View
      style={styles.linkedList}
      accessibilityRole="list"
      accessibilityLabel={title}
    >
      {linkedHabits.map((habit) => (
        <View key={habit.id} style={styles.linkedRow}>
          <View style={styles.linkedWell}>
            <Repeat size={18} strokeWidth={1.8} color={tokens.fg2} />
          </View>
          <Text style={styles.linkedTitle} numberOfLines={1}>
            {habit.title}
          </Text>
        </View>
      ))}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    historyEntry: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
      gap: 3,
    },
    historyEntryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    historyDate: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    historyValue: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    historyNote: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    toggleAll: {
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    toggleAllText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    linkedList: {
    },
    linkedRow: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    linkedWell: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    linkedTitle: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
    },
  })
}
