'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function useChatNavigation() {
  const router = useRouter()
  return useCallback((destination: Parameters<typeof router.push>[0]) => {
    useUIStore.getState().setAstraConversationOpen(false)
    router.push(destination)
  }, [router])
}
