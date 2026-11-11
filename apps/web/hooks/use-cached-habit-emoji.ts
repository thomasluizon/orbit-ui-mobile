import { useCallback, useContext } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { findCachedHabitDetail } from '@orbit/shared/query'

/** The app always mounts a query client; the null branch serves the chat card tests, which render the card without a `QueryClientProvider`. */
export function useCachedHabitEmoji(): (habitId: string) => string | undefined {
  const queryClient = useContext(QueryClientContext)
  return useCallback((habitId) => queryClient ? findCachedHabitDetail(queryClient, habitId)?.emoji ?? undefined : undefined, [queryClient])
}
