'use client'

import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui-store'

export function closeChatForNavigation() {
  useUIStore.getState().setAstraConversationOpen(false)
}

export function useChatNavigation() {
  const router = useRouter()
  return (destination: Parameters<typeof router.push>[0]) => {
    closeChatForNavigation()
    router.push(destination)
  }
}
