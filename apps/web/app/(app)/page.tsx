import { loadTodayInitialHabits } from './today-initial-data'
import { TodayPageClient } from './today-page-client'

interface TodayPageProps {
  searchParams: Promise<{ date?: string | string[] }>
}

export default async function TodayPage({ searchParams }: Readonly<TodayPageProps>) {
  const { date } = await searchParams
  const requestedDate = Array.isArray(date) ? date[0] : date
  const initialHabits = await loadTodayInitialHabits(requestedDate)

  return <TodayPageClient initialHabits={initialHabits} />
}
