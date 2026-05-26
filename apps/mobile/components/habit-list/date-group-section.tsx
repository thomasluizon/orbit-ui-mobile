import type { ReactNode } from 'react'
import { View } from 'react-native'
import { isToday as isDateToday, isTomorrow, isYesterday } from 'date-fns'
import { formatLocaleDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { SectionLabel } from '@/components/ui/section-label'

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
