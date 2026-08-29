import { useLocalSearchParams } from 'expo-router'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

export default function HabitDetailRoute() {
  const params = useLocalSearchParams<{ id: string; date?: string; from?: string; parent?: string }>()
  return <HabitDetailScreen habitId={params.id} date={params.date} parentId={params.parent} fromToday={params.from === 'today'} />
}
