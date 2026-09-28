import { formatAPIDate } from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { serverAuthFetch } from '@/lib/server-fetch'
import { loadTodayInitialHabits } from './today-initial-data'
import { TodayPageClient } from './today-page-client'

interface TodayPageProps {
  searchParams: Promise<{ date?: string | string[] }>
}

async function loadTodayInitialProfile() {
  try {
    return await serverAuthFetch(API.profile.get, { cache: 'no-store' }, profileSchema)
  } catch {
    return null
  }
}

export default async function TodayPage({ searchParams }: Readonly<TodayPageProps>) {
  const { date } = await searchParams
  const requestedDate = Array.isArray(date) ? date[0] : date
  const initialToday = formatAPIDate(new Date())
  const [initialHabits, initialProfile] = await Promise.all([
    loadTodayInitialHabits(requestedDate, initialToday),
    loadTodayInitialProfile(),
  ])

  return <TodayPageClient initialToday={initialToday} initialHabits={initialHabits} initialProfile={initialProfile} />
}
