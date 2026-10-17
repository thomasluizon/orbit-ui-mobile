import { useRouter } from 'expo-router'
import { useUIStore } from '@/stores/ui-store'

export function useChatNavigation() {
  const router = useRouter()
  return (destination: Parameters<typeof router.push>[0]) => {
    useUIStore.getState().setAstraConversationOpen(false)
    router.push(destination)
  }
}
