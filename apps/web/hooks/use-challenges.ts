'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { challengeKeys } from '@orbit/shared/query'
import {
  challengeDetailSchema,
  challengeListSchema,
  type ChallengeDetail,
  type ChallengeListItem,
  type CreateChallengeRequest,
  type JoinChallengeRequest,
} from '@orbit/shared/types/challenge'
import { createApiClientError } from '@orbit/shared/utils'
import {
  createChallenge,
  joinChallenge,
  leaveChallenge,
  setChallengeHabits,
  type ChallengeActionResult,
} from '@/app/actions/challenges'

async function getChallenges<T>(url: string, parse: (raw: unknown) => T): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw createApiClientError(res.status, body, `Request failed: ${res.status}`)
  }
  return parse(await res.json())
}

function unwrap<T>(result: ChallengeActionResult<T>): T {
  if (result.ok) return result.data
  throw createApiClientError(
    result.status,
    result.code ? { errorCode: result.code } : null,
    'Request failed',
  )
}

/** The caller's challenges (active first, then completed). Gate reads on `enabled` so opted-out users never call. */
export function useChallenges(options?: { enabled?: boolean }) {
  return useQuery<ChallengeListItem[]>({
    queryKey: challengeKeys.list(),
    queryFn: () => getChallenges(API.challenges.list, (raw) => challengeListSchema.parse(raw)),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** A single challenge with participants and the caller's own linked habit ids. */
export function useChallengeDetail(id: string | null, options?: { enabled?: boolean }) {
  return useQuery<ChallengeDetail>({
    queryKey: challengeKeys.detail(id ?? ''),
    queryFn: () =>
      getChallenges(API.challenges.detail(id ?? ''), (raw) => challengeDetailSchema.parse(raw)),
    enabled: (options?.enabled ?? true) && !!id,
    staleTime: 30_000,
  })
}

export function useCreateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateChallengeRequest) => unwrap(await createChallenge(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useJoinChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: JoinChallengeRequest) => unwrap(await joinChallenge(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useLeaveChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (challengeId: string) => unwrap(await leaveChallenge(challengeId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useSetChallengeHabits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { challengeId: string; habitIds: string[] }) =>
      unwrap(await setChallengeHabits(input.challengeId, { habitIds: input.habitIds })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.detail(variables.challengeId) })
      void queryClient.invalidateQueries({ queryKey: challengeKeys.list() })
    },
  })
}
