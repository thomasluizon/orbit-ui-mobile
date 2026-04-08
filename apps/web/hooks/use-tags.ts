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

type TagQueryClient = ReturnType<typeof useQueryClient>
type TagMutationContext = {
  previousLists?: ReadonlyArray<readonly [readonly unknown[], Tag[] | undefined]>
  previousHabitLists?: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>
  tempId?: string
}

function restoreQueryLists<TData>(
  queryClient: TagQueryClient,
  previousLists: ReadonlyArray<readonly [readonly unknown[], TData | undefined]>,
): void {
  for (const [key, value] of previousLists) {
    if (value) queryClient.setQueryData(key, value)
  }
}

function renameHabitTagReferences(
  tagId: string,
  name: string,
  color: string,
): (tags: Tag[]) => Tag[] {
  return (tags) => tags.map((tag) => (tag.id === tagId ? { ...tag, name, color } : tag))
}

function removeHabitTagReferences(tagId: string): (tags: Tag[]) => Tag[] {
  return (tags) => tags.filter((tag) => tag.id !== tagId)
}

function restoreTagMutationContext(
  queryClient: TagQueryClient,
  context: TagMutationContext | undefined,
): void {
  if (context?.previousLists) {
    restoreQueryLists(queryClient, context.previousLists)
  }
  if (context?.previousHabitLists) {
    restoreQueryLists(queryClient, context.previousHabitLists)
  }
}

async function invalidateTagMutationQueries(queryClient: TagQueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: tagKeys.all })
  await queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
}

function getAvailableTags(queryClient: TagQueryClient): Tag[] {
  return queryClient
    .getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
    .flatMap(([, tags]) => tags ?? [])
}

function updateHabitTagReferences(
  queryClient: TagQueryClient,
  updater: (tags: Tag[]) => Tag[],
): void {
  queryClient.setQueriesData<HabitScheduleItem[]>(
    { queryKey: habitKeys.lists() },
    (old) => mapHabitTagReferences(old, updater),
  )
}

function appendOptimisticTag(
  queryClient: TagQueryClient,
  tempId: string,
  name: string,
  color: string,
): void {
  queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
    appendTag(old, { id: tempId, name, color }),
  )
}

function syncCreatedTagId(
  queryClient: TagQueryClient,
  tempId: string,
  nextId: string,
): void {
  queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
    updateTagInList(old, tempId, { id: nextId }),
  )
}

function setOptimisticTagDetails(
  queryClient: TagQueryClient,
  tagId: string,
  name: string,
  color: string,
): void {
  queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
    updateTagInList(old, tagId, { name, color }),
  )
}

function setOptimisticDeletedTag(queryClient: TagQueryClient, tagId: string): void {
  queryClient.setQueriesData<Tag[]>({ queryKey: tagKeys.lists() }, (old) =>
    removeTagFromList(old, tagId),
  )
}

function setOptimisticAssignedTags(
  queryClient: TagQueryClient,
  habitId: string,
  nextTags: Tag[],
): void {
  queryClient.setQueriesData<HabitScheduleItem[]>(
    { queryKey: habitKeys.lists() },
    (old) => setHabitTags(old, habitId, nextTags),
  )
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

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createTag(name, color),

    onMutate: async ({ name, color }) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all })

      const previousLists = queryClient.getQueriesData<Tag[]>({ queryKey: tagKeys.lists() })
      const tempId = `web-tag-${crypto.randomUUID()}`

      appendOptimisticTag(queryClient, tempId, name, color)

      return { previousLists, tempId }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSuccess: (result, _vars, context) => {
      if (!context?.tempId) return

      syncCreatedTagId(queryClient, context.tempId, result.id)
    },

    onSettled: () => {
      void invalidateTagMutationQueries(queryClient)
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

      setOptimisticTagDetails(queryClient, tagId, name, color)
      updateHabitTagReferences(queryClient, renameHabitTagReferences(tagId, name, color))

      return { previousLists, previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSettled: () => {
      void invalidateTagMutationQueries(queryClient)
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

      setOptimisticDeletedTag(queryClient, tagId)
      updateHabitTagReferences(queryClient, removeHabitTagReferences(tagId))

      return { previousLists, previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSettled: () => {
      void invalidateTagMutationQueries(queryClient)
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
      const availableTags = getAvailableTags(queryClient)
      const nextTags = resolveHabitTags(availableTags, tagIds)

      setOptimisticAssignedTags(queryClient, habitId, nextTags)

      return { previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSettled: () => {
      void invalidateTagMutationQueries(queryClient)
    },
  })
}
