import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { accountabilityKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import {
  accountabilityCheckInsPageSchema,
  accountabilityPairsResponseSchema,
  type AccountabilityCheckInsPage,
  type AccountabilityPairsResponse,
  type InviteAccountabilityBuddyRequest,
} from '@orbit/shared/types/accountability'
import { apiClient } from '@/lib/api-client'

/** All accountability pairs for the current user: active pairs, incoming invites, outgoing invites. */
export function useAccountabilityPairs(options?: { enabled?: boolean }) {
  return useQuery<AccountabilityPairsResponse>({
    queryKey: accountabilityKeys.pairs(),
    queryFn: async () =>
      accountabilityPairsResponseSchema.parse(await apiClient<unknown>(API.accountability.pairs)),
    enabled: options?.enabled ?? true,
    staleTime: QUERY_STALE_TIMES.accountability,
  })
}

/** Check-in history for a single accountability pair. Disabled until a pair id is available. */
export function useAccountabilityCheckIns(pairId: string | null, options?: { enabled?: boolean }) {
  return useQuery<AccountabilityCheckInsPage>({
    queryKey: accountabilityKeys.checkIns(pairId ?? ''),
    queryFn: async () =>
      accountabilityCheckInsPageSchema.parse(
        await apiClient<unknown>(API.accountability.checkIns(pairId ?? '')),
      ),
    enabled: (options?.enabled ?? true) && Boolean(pairId),
    staleTime: QUERY_STALE_TIMES.accountability,
  })
}

export function useInviteAccountabilityBuddy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InviteAccountabilityBuddyRequest) =>
      apiClient<{ id: string }>(API.accountability.pairs, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useAcceptAccountabilityPair() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pairId: string; habitIds: string[] }) =>
      apiClient<void>(API.accountability.accept(input.pairId), {
        method: 'POST',
        body: JSON.stringify({ habitIds: input.habitIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useEndAccountabilityPair() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pairId: string) =>
      apiClient<void>(API.accountability.end(pairId), { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useSetAccountabilityHabits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pairId: string; habitIds: string[] }) =>
      apiClient<void>(API.accountability.habits(input.pairId), {
        method: 'PUT',
        body: JSON.stringify({ habitIds: input.habitIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useCheckInAccountability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pairId: string; note?: string }) =>
      apiClient<{ id: string }>(API.accountability.checkIns(input.pairId), {
        method: 'POST',
        body: JSON.stringify({ note: input.note }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
      void queryClient.invalidateQueries({
        queryKey: accountabilityKeys.checkIns(variables.pairId),
      })
    },
  })
}
