import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { useHabits } from '@/hooks/use-habit-queries'
import { getGoalHabitProgressNote } from '@orbit/shared/hooks'
import type { GoalType } from '@orbit/shared/types/goal'

export function GoalHabitsSelectionNote({ selectedIds, goalType }: Readonly<{ selectedIds: string[]; goalType: GoalType }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const habits = useHabits({})
  const note = getGoalHabitProgressNote(selectedIds, habits.data?.habitsById, goalType)
  return note ? <Text style={{ fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22, color: tokens.fg2 }}>{t(note)}</Text> : null
}
