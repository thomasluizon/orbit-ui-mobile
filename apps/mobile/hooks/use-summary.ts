/**
 * Mobile parity port of `apps/web/hooks/use-summary.ts`. The actual query
 * implementation lives in `use-habit-queries.ts` (where the mobile API
 * client is wired). This file re-exports it under the parity-aligned
 * filename so consumers that grep for `use-summary.ts` find a hit on
 * both platforms.
 *
 * `useInvalidateSummary` is added here for parity since web exposes it
 * from the same module.
 */
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'

export { useSummary } from './use-habit-queries'

export function useInvalidateSummary() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: [...habitKeys.all, 'summary'],
    })
  }
}
