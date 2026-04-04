import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tagKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'

export interface Tag {
  id: string
  name: string
  color: string
}

export function useTags() {
  const query = useQuery({
    queryKey: tagKeys.lists(),
    queryFn: () => apiClient<Tag[]>(API.tags.list),
    staleTime: QUERY_STALE_TIMES.tags,
  })

  return {
    tags: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  }
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      apiClient<{ id: string }>(API.tags.create, {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tagId, name, color }: { tagId: string; name: string; color: string }) =>
      apiClient<void>(API.tags.update(tagId), {
        method: 'PUT',
        body: JSON.stringify({ name, color }),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (tagId: string) =>
      apiClient<void>(API.tags.delete(tagId), { method: 'DELETE' }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

export function useAssignTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, tagIds }: { habitId: string; tagIds: string[] }) =>
      apiClient<void>(API.tags.assign(habitId), {
        method: 'PUT',
        body: JSON.stringify({ tagIds }),
      }),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}
