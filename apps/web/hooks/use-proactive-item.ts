'use client'

import { useQuery } from '@tanstack/react-query'
import { proactiveItemQueryOptions, proactiveItemQueryResult } from '@orbit/shared/hooks'
import { useAuthStore } from '@/stores/auth-store'
import { proactiveItemController } from '@/lib/proactive-item'

export function useProactiveItem() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const query = useQuery(proactiveItemQueryOptions(proactiveItemController, isAuthenticated))
  return proactiveItemQueryResult(query, proactiveItemController.openProactiveItem)
}
