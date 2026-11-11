import { useCallback, useContext } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { findCachedHabitDetail } from '@orbit/shared/query'

/** Reads the cache only when a query client exists: a chat card also renders outside the app shell, with no cache to read. */
export function useCachedHabitEmoji(): (habitId: string) => string | undefined {
  const queryClient = useContext(QueryClientContext)
  return useCallback((habitId) => queryClient ? findCachedHabitDetail(queryClient, habitId)?.emoji ?? undefined : undefined, [queryClient])
}
