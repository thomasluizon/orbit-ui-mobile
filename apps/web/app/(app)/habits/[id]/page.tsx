'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { resolveHabitDetailRouteDate } from '@orbit/shared/utils'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

export default function HabitDetailPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const dateValues = searchParams.getAll('date')
  return (
    <HabitDetailScreen
      habitId={params.id}
      date={resolveHabitDetailRouteDate(dateValues.length === 1 ? dateValues[0] : dateValues)}
      parentId={searchParams.get('parent')}
      fromToday={searchParams.get('from') === 'today'}
    />
  )
}
