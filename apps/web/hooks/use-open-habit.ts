import { useRouter } from 'next/navigation'

export function useOpenHabit() {
  const router = useRouter()
  return (id: string, date: string, fromToday = false) => router.push(`/habits/${id}?date=${date}${fromToday ? '&from=today' : ''}`)
}
