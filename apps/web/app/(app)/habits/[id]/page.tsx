'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

export default function HabitDetailPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  return (
    <HabitDetailScreen
      habitId={params.id}
      date={searchParams.get('date')}
      parentId={searchParams.get('parent')}
      fromToday={searchParams.get('from') === 'today'}
    />
  )
}
