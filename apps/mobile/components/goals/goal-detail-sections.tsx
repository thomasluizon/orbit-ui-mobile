import { useState, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ListRow } from '@/components/ui/list-row'
import type { Goal, GoalMetrics } from '@orbit/shared/types/goal'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTranslation } from 'react-i18next'

const HISTORY_PREVIEW_COUNT = 3

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  entries: GoalProgressHistoryEntry[]
  target: number
  unit: string
  formatDate: (dateStr: string) => string
  showAllLabel: string
  showLessLabel: string
}

function getDeltaPresentation(entry: GoalProgressHistoryEntry) {
  const delta = entry.value - entry.previousValue
  if (delta > 0) return { testID: 'history-delta-positive', value: delta }
  if (delta < 0) return { testID: 'history-delta-negative', value: delta }
  return { testID: 'history-delta-zero', value: delta }
}

export function GoalProgressHistorySection({
  entries,
  target,
  unit,
  formatDate,
  showAllLabel,
  showLessLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
  const signedNumberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language, { signDisplay: 'exceptZero' }),
    [i18n.language],
  )

  const visibleEntries = useMemo(
    () => (showAllHistory ? entries : entries.slice(0, HISTORY_PREVIEW_COUNT)),
    [entries, showAllHistory],
  )

  if (entries.length === 0) return null

  return (
    <View accessibilityRole="list">
      {visibleEntries.map((entry) => {
        const delta = getDeltaPresentation(entry)
        const date = formatDate(entry.createdAtUtc)
        const formattedDelta = signedNumberFormatter.format(delta.value)
        const current = numberFormatter.format(entry.value)
        const formattedTarget = numberFormatter.format(target)
        return (
          <View
            key={`${entry.createdAtUtc}-${entry.value}`}
            style={styles.historyEntry}
          >
            <View style={styles.historyEntryHeader}>
              <Text testID="history-date" accessibilityLabel={t('goals.detail.historyDate', { date })} style={styles.historyDate}>
                {date}
              </Text>
              <Text testID={delta.testID} accessibilityLabel={t('goals.detail.historyDelta', { delta: formattedDelta, unit })} style={styles.historyDelta}>{formattedDelta}</Text>
              <Text testID="history-progress" accessibilityLabel={t('goals.detail.historyProgress', { current, target: formattedTarget, unit })} style={styles.historyProgress}>{current} / {formattedTarget}</Text>
            </View>
            {entry.note ? (
              <Text style={styles.historyNote}>{entry.note}</Text>
            ) : null}
          </View>
        )
      })}
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
          accessibilityState={{ expanded: showAllHistory }}
        >
          <Text style={styles.toggleAllText}>
            {showAllHistory ? showLessLabel : showAllLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  emptyLabel: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
  habitAdherence: GoalMetrics['habitAdherence']
  formatValue: (currentStreak: number) => string
  onOpenHabit: (habitId: string) => void
}

export function GoalLinkedHabitsSection({
  title,
  emptyLabel,
  linkedHabits,
  habitAdherence,
  formatValue,
  onOpenHabit,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const adherenceByHabitId = useMemo(
    () => new Map(habitAdherence.map((metrics) => [metrics.habitId, metrics])),
    [habitAdherence],
  )

  return (
    <View
      style={styles.linkedList}
      accessibilityRole="list"
      accessibilityLabel={title}
    >
      {linkedHabits.length === 0 ? (
        <Text style={styles.emptyLabel}>{emptyLabel}</Text>
      ) : linkedHabits.map((habit) => {
        const adherence = adherenceByHabitId.get(habit.id)
        const value = adherence ? formatValue(adherence.currentStreak) : undefined
        return (
          <ListRow
            key={habit.id}
            title={habit.title}
            value={value}
            accessibilityLabel={value ? `${habit.title}, ${value}` : habit.title}
            onClick={() => onOpenHabit(habit.id)}
          />
        )
      })}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    historyEntry: {
      paddingHorizontal: 0,
      paddingVertical: 8,
      gap: 4,
    },
    historyEntryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    historyDate: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
      flex: 1,
      minWidth: 0,
    },
    historyDelta: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      color: tokens.fg2,
      fontVariant: ['tabular-nums'],
      minWidth: 32,
      textAlign: 'right',
    },
    historyProgress: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
      minWidth: 56,
      textAlign: 'right',
    },
    historyNote: {
      fontFamily: 'Geist_400Regular',
      fontSize: 13,
      color: tokens.fg2,
      flexShrink: 1,
    },
    toggleAll: {
      paddingHorizontal: 0,
      paddingVertical: 8,
    },
    toggleAllText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    linkedList: {
    },
    emptyLabel: {
      color: tokens.fg3,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 0,
      paddingVertical: 8,
    },
  })
}
