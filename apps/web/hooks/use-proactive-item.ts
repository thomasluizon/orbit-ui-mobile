'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { currentProactiveOptions, openProactiveItem } from '@/lib/proactive-item'

export function useProactiveItem() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const query = useQuery({
    ...currentProactiveOptions,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  })
  return { ...query, item: query.data ?? null, openItem: openProactiveItem }
}
