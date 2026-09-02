import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { useUIStore } from '@/stores/ui-store'

export default function ChatRedirect() {
  const router = useRouter()
  const setAstraConversationOpen = useUIStore((state) => state.setAstraConversationOpen)

  useEffect(() => {
    setAstraConversationOpen(true)
    router.replace('/')
  }, [router, setAstraConversationOpen])

  return null
}
