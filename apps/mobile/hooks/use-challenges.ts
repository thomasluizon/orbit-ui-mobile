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
import { apiClient } from '@/lib/api-client'

/** The caller's challenges (active first, then completed). Gated on `enabled` so opted-out users never call. */
export function useChallenges(options?: { enabled?: boolean }) {
  return useQuery<ChallengeListItem[]>({
    queryKey: challengeKeys.list(),
    queryFn: async () => challengeListSchema.parse(await apiClient<unknown>(API.challenges.list)),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** A single challenge with participants and the caller's own linked habit ids. */
export function useChallengeDetail(id: string | null, options?: { enabled?: boolean }) {
  return useQuery<ChallengeDetail>({
    queryKey: challengeKeys.detail(id ?? ''),
    queryFn: async () =>
      challengeDetailSchema.parse(await apiClient<unknown>(API.challenges.detail(id ?? ''))),
    enabled: (options?.enabled ?? true) && !!id,
    staleTime: 30_000,
  })
}

export function useCreateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChallengeRequest) =>
      apiClient<{ id: string }>(API.challenges.create, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useJoinChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: JoinChallengeRequest) =>
      apiClient<void>(API.challenges.join, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useLeaveChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (challengeId: string) =>
      apiClient<void>(API.challenges.leave(challengeId), { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.all })
    },
  })
}

export function useSetChallengeHabits() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { challengeId: string; habitIds: string[] }) =>
      apiClient<void>(API.challenges.setHabits(input.challengeId), {
        method: 'PUT',
        body: JSON.stringify({ habitIds: input.habitIds }),
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: challengeKeys.detail(variables.challengeId) })
      void queryClient.invalidateQueries({ queryKey: challengeKeys.list() })
    },
  })
}
