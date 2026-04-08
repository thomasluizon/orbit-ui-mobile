'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitKeys, tagKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import {
  appendTag,
  mapHabitTagReferences,
  removeTagFromList,
  resolveHabitTags,
  setHabitTags,
  updateTagInList,
} from '@orbit/shared/utils'
import { assignTags, createTag, deleteTag, getTags, updateTag } from '@/app/actions/tags'

export interface Tag {
  id: string
  name: string
  color: string
}

export function useTags() {
  const query = useQuery({
    queryKey: tagKeys.lists(),
    queryFn: () => getTags(),
    staleTime: QUERY_STALE_TIMES.tags,
  })

  return {
    tags: (query.data ?? []) as Tag[],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  }
}

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

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createTag(name, color),

    onMutate: async ({ name, color }) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all })

      const previousLists = queryClient.getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
      const tempId = `web-tag-${crypto.randomUUID()}`

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        appendTag(old, { id: tempId, name, color }),
      )

      return { previousLists, tempId }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreTagLists(queryClient, context.previousLists)
      }
    },

    onSuccess: (result, _vars, context) => {
      if (!context?.tempId) return

      queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
        updateTagInList(old, context.tempId, { id: result.id }),
      )
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ tagId, name, color }: { tagId: string; name: string; color: string }) =>
      updateTag(tagId, name, color),

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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (tagId: string) => deleteTag(tagId),

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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}

export function useAssignTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, tagIds }: { habitId: string; tagIds: string[] }) =>
      assignTags(habitId, tagIds),

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

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}
