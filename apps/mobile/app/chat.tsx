import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { queryClient } from '@/lib/query-client'
import { openCurrentProactiveItem } from '@/lib/proactive-item'

export default function ChatRedirect() {
  const router = useRouter()

  useEffect(() => {
    void openCurrentProactiveItem(queryClient)
    router.replace('/')
  }, [router])

  return null
}
