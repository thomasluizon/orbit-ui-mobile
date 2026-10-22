import { useAccountScopedState } from '@/hooks/use-session-reset'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { formatLocaleDate, parseAPIDate } from '@orbit/shared/utils'
import { DateRow } from '@/components/ui/date-row'
import { ListRow } from '@/components/ui/list-row'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

export function HabitDetailFields({ habit, summary }: Readonly<{ habit: NormalizedHabit; summary?: string | null }>) {
  const { t, i18n } = useTranslation()
  const [goalId, setGoalId] = useAccountScopedState<string | null>(null)
  return <View style={{ gap: 12 }}>
    {summary ? <ListRow placement="column" title={t('habits.detail.schedule')} value={summary} readOnly /> : null}
    {habit.endDate ? <DateRow label={t('habits.form.endDate')} value={formatLocaleDate(parseAPIDate(habit.endDate), i18n.language, { dateStyle: 'medium' })} /> : null}
    {(habit.linkedGoals ?? []).map((goal) => <ListRow key={goal.id} placement="column" title={goal.title} onClick={() => setGoalId(goal.id)} />)}
    {goalId ? <GoalDetailDrawer open goalId={goalId} onClose={() => setGoalId(null)} /> : null}
  </View>
}
