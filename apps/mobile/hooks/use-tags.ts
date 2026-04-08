import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { habitKeys, tagKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import {
  appendTag,
  mapHabitTagReferences,
  removeTagFromList,
  resolveHabitTags,
  setHabitTags,
  updateTagInList,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import {
  buildQueuedMutation,
  createQueuedAck,
  createTempEntityId,
  isQueuedResult,
  queueOrExecute,
  withQueuedMarker,
} from '@/lib/offline-mutations'

export interface Tag {
  id: string
  name: string
  color: string
}

const pendingCreateTagIds = new WeakMap<{ name: string; color: string }, string>()

function restoreTagLists(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: ReadonlyArray<readonly [readonly unknown[], Tag[] | undefined]>,
): void {
  for (const [key, value] of previousLists) {
    if (value) queryClient.setQueryData(key, value)
  }
}

function restoreHabitLists(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>,
): void {
  for (const [key, value] of previousLists) {
    if (value) queryClient.setQueryData(key, value)
  }
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
    mutationFn: async (vars: { name: string; color: string }) => {
      const tempId = pendingCreateTagIds.get(vars) ?? createTempEntityId('tag')
      const payload = vars
      const mutation = buildQueuedMutation({
        type: 'createTag',
        scope: 'tags',
        endpoint: API.tags.create,
        method: 'POST',
        payload,
        entityType: 'tag',
        clientEntityId: tempId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<{ id: string }>(API.tags.create, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        queuedResult: withQueuedMarker({ id: tempId }, mutation.id),
      })
    },

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all })

      const previousLists = queryClient.getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
      const tempId = createTempEntityId('tag')
      pendingCreateTagIds.set(vars, tempId)

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        appendTag(old, { id: tempId, name: vars.name, color: vars.color }),
      )

      return { previousLists, tempId, request: vars }
    },

    onError: (_err, _vars, context) => {
      if (context?.request) {
        pendingCreateTagIds.delete(context.request)
      }
      if (context?.previousLists) {
        restoreTagLists(queryClient, context.previousLists)
      }
    },

    onSuccess: (result, _vars, context) => {
      if (context?.request) {
        pendingCreateTagIds.delete(context.request)
      }
      if (isQueuedResult(result)) return
      if (!context?.tempId) return

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        updateTagInList(old, context.tempId, { id: result.id }),
      )
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tagId, name, color }: { tagId: string; name: string; color: string }) => {
      const payload = { name, color }
      const mutation = buildQueuedMutation({
        type: 'updateTag',
        scope: 'tags',
        endpoint: API.tags.update(tagId),
        method: 'PUT',
        payload,
        entityType: 'tag',
        targetEntityId: tagId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.tags.update(tagId), {
          method: 'PUT',
          body: JSON.stringify(payload),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async ({ tagId, name, color }) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all })
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
      const previousHabitLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        updateTagInList(old, tagId, { name, color }),
      )
      queryClient.setQueriesData<HabitScheduleItem[]>(
        { queryKey: habitKeys.lists() },
        (old) =>
          mapHabitTagReferences(old, (tags) =>
            tags.map((tag) => (tag.id === tagId ? { ...tag, name, color } : tag)),
          ),
      )

      return { previousLists, previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreTagLists(queryClient, context.previousLists)
      }
      if (context?.previousHabitLists) {
        restoreHabitLists(queryClient, context.previousHabitLists)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tagId: string) => {
      const mutation = buildQueuedMutation({
        type: 'deleteTag',
        scope: 'tags',
        endpoint: API.tags.delete(tagId),
        method: 'DELETE',
        payload: null,
        entityType: 'tag',
        targetEntityId: tagId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.tags.delete(tagId), { method: 'DELETE' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all })
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
      const previousHabitLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        removeTagFromList(old, tagId),
      )
      queryClient.setQueriesData<HabitScheduleItem[]>(
        { queryKey: habitKeys.lists() },
        (old) => mapHabitTagReferences(old, (tags) => tags.filter((tag) => tag.id !== tagId)),
      )

      return { previousLists, previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreTagLists(queryClient, context.previousLists)
      }
      if (context?.previousHabitLists) {
        restoreHabitLists(queryClient, context.previousHabitLists)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useAssignTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ habitId, tagIds }: { habitId: string; tagIds: string[] }) => {
      const payload = { tagIds }
      const mutation = buildQueuedMutation({
        type: 'assignTags',
        scope: 'tags',
        endpoint: API.tags.assign(habitId),
        method: 'PUT',
        payload,
        targetEntityId: habitId,
        dependsOn: tagIds.filter((tagId) => tagId.startsWith('offline-')),
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.tags.assign(habitId), {
          method: 'PUT',
          body: JSON.stringify(payload),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async ({ habitId, tagIds }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousHabitLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })
      const availableTags = queryClient
        .getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
        .flatMap(([, tags]) => tags ?? [])
      const nextTags = resolveHabitTags(availableTags, tagIds)

      queryClient.setQueriesData<HabitScheduleItem[]>(
        { queryKey: habitKeys.lists() },
        (old) => setHabitTags(old, habitId, nextTags),
      )

      return { previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousHabitLists) {
        restoreHabitLists(queryClient, context.previousHabitLists)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}
