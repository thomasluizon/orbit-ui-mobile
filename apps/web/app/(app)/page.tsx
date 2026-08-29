import { formatAPIDate } from '@orbit/shared/utils'
import { loadTodayInitialHabits } from './today-initial-data'
import { TodayPageClient } from './today-page-client'

interface TodayPageProps {
  searchParams: Promise<{ date?: string | string[] }>
}

export default async function TodayPage({ searchParams }: Readonly<TodayPageProps>) {
  const { date } = await searchParams
  const requestedDate = Array.isArray(date) ? date[0] : date
  const initialToday = formatAPIDate(new Date())
  const initialHabits = await loadTodayInitialHabits(requestedDate, initialToday)

  return <TodayPageClient initialToday={initialToday} initialHabits={initialHabits} />
}
