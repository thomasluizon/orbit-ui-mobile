import { useLocalSearchParams } from 'expo-router'
import { resolveHabitDetailRouteDate } from '@orbit/shared/utils'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

export default function HabitDetailRoute() {
  const params = useLocalSearchParams<{ id: string; date?: string | string[]; from?: string; parent?: string }>()
  return <HabitDetailScreen habitId={params.id} date={resolveHabitDetailRouteDate(params.date)} parentId={params.parent} fromToday={params.from === 'today'} />
}
