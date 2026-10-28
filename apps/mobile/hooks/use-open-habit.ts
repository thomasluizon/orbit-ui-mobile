import { useRouter } from 'expo-router'

export function useOpenHabit() {
  const router = useRouter()
  return (id: string, date: string, fromToday = false) => router.push({ pathname: '/habits/[id]', params: { id, date, ...(fromToday ? { from: 'today' } : {}) } })
}
