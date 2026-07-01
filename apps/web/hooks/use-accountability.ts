'use client'

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
import { createApiClientError } from '@orbit/shared/utils'
import {
  acceptAccountabilityPair,
  checkInAccountability,
  endAccountabilityPair,
  inviteAccountabilityBuddy,
  setAccountabilityHabits,
} from '@/app/actions/accountability'
import type { SocialActionResult } from '@/app/actions/social'

async function getAccountability<T>(url: string, parse: (raw: unknown) => T): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw createApiClientError(res.status, body, `Request failed: ${res.status}`)
  }
  return parse(await res.json())
}

function unwrap<T>(result: SocialActionResult<T>): T {
  if (result.ok) return result.data
  throw createApiClientError(
    result.status,
    result.code ? { errorCode: result.code } : null,
    'Request failed',
  )
}

/** All accountability pairs for the current user: active pairs, incoming invites, outgoing invites. */
export function useAccountabilityPairs(options?: { enabled?: boolean }) {
  return useQuery<AccountabilityPairsResponse>({
    queryKey: accountabilityKeys.pairs(),
    queryFn: () =>
      getAccountability(API.accountability.pairs, (raw) =>
        accountabilityPairsResponseSchema.parse(raw),
      ),
    enabled: options?.enabled ?? true,
    staleTime: QUERY_STALE_TIMES.accountability,
  })
}

/** Check-in history for a single accountability pair. Disabled until a pair id is available. */
export function useAccountabilityCheckIns(pairId: string | null, options?: { enabled?: boolean }) {
  return useQuery<AccountabilityCheckInsPage>({
    queryKey: accountabilityKeys.checkIns(pairId ?? ''),
    queryFn: () =>
      getAccountability(API.accountability.checkIns(pairId ?? ''), (raw) =>
        accountabilityCheckInsPageSchema.parse(raw),
      ),
    enabled: (options?.enabled ?? true) && Boolean(pairId),
    staleTime: QUERY_STALE_TIMES.accountability,
  })
}

export function useInviteAccountabilityBuddy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InviteAccountabilityBuddyRequest) =>
      unwrap(await inviteAccountabilityBuddy(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useAcceptAccountabilityPair() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pairId: string; habitIds: string[] }) =>
      unwrap(await acceptAccountabilityPair(input.pairId, { habitIds: input.habitIds })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useEndAccountabilityPair() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pairId: string) => unwrap(await endAccountabilityPair(pairId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useSetAccountabilityHabits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pairId: string; habitIds: string[] }) =>
      unwrap(await setAccountabilityHabits(input.pairId, { habitIds: input.habitIds })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
    },
  })
}

export function useCheckInAccountability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pairId: string; note?: string }) =>
      unwrap(await checkInAccountability(input.pairId, { note: input.note })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: accountabilityKeys.pairs() })
      void queryClient.invalidateQueries({
        queryKey: accountabilityKeys.checkIns(variables.pairId),
      })
    },
  })
}
