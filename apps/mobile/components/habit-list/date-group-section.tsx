import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { isToday as isDateToday, isTomorrow, isYesterday } from 'date-fns'
import { formatLocaleDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface HabitListDateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

export function formatDateGroupLabel(
  key: string,
  locale: string,
  t: (key: string) => string,
): string {
  if (!key) return t('common.unknown')

  const date = new Date(`${key}T00:00:00`)

  if (isDateToday(date)) return t('dates.today')
  if (isTomorrow(date)) return t('dates.tomorrow')
  if (isYesterday(date)) return t('dates.yesterday')

  return formatLocaleDate(date, locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  renderHabit: (habit: NormalizedHabit, index: number) => ReactNode
}

/** Date-group header: 13/600 muted label with a hairline rule (overdue uses
 *  status-overdue), mirroring the web habit-list grouping. */
export function HabitListDateGroupSection({
  group,
  overdueLabel,
  renderHabit,
}: HabitListDateGroupSectionProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View>
      <View style={styles.header}>
        <Text
          style={[
            styles.label,
            { color: group.isOverdue ? tokens.statusOverdue : tokens.fg3 },
          ]}
        >
          {group.isOverdue ? overdueLabel : group.label}
        </Text>
        <View
          style={[
            styles.rule,
            group.isOverdue
              ? { backgroundColor: tokens.statusOverdue, opacity: 0.32 }
              : { backgroundColor: tokens.hairline },
          ]}
        />
      </View>
      {group.habits.map((habit, index) => (
        <View key={habit.id}>{renderHabit(habit, index)}</View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 13,
  },
  rule: {
    flex: 1,
    height: 1,
  },
})
