import { formatAPIDate } from '@orbit/shared/utils'
import { headers } from 'next/headers'
import { API } from '@orbit/shared/api'
import { ACCOUNT_ID_HEADER } from '@/lib/auth-api'
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
  const serverAccountId = (await headers()).get(ACCOUNT_ID_HEADER)
  const { date } = await searchParams
  const requestedDate = Array.isArray(date) ? date[0] : date
  const initialToday = formatAPIDate(new Date())
  const [initialHabits, initialProfile] = await Promise.all([
    loadTodayInitialHabits(requestedDate, initialToday),
    loadTodayInitialProfile(),
  ])

  return <TodayPageClient initialToday={initialToday} initialHabits={initialHabits} initialProfile={initialProfile} serverAccountId={serverAccountId} />
}
