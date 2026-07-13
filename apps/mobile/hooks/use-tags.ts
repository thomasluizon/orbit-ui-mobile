import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { habitKeys, tagKeys , QUERY_STALE_TIMES } from '@orbit/shared/query'

import { API } from '@orbit/shared/api'
import type { HabitScheduleItem, SuggestTagsResponse } from '@orbit/shared/types/habit'
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
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'

export interface Tag {
  id: string
  name: string
  color: string
}

type TagQueryClient = ReturnType<typeof useQueryClient>
type TagMutationContext = {
  previousLists?: readonly (readonly [readonly unknown[], Tag[] | undefined])[]
  previousHabitLists?: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
  tempId?: string
  request?: { name: string; color: string }
}

const pendingCreateTagIds = new WeakMap<{ name: string; color: string }, string>()

function restoreQueryLists<TData>(
  queryClient: TagQueryClient,
  previousLists: readonly (readonly [readonly unknown[], TData | undefined])[],
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
  if (context?.request) {
    pendingCreateTagIds.delete(context.request)
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

      appendOptimisticTag(queryClient, tempId, vars.name, vars.color)

      return { previousLists, tempId, request: vars }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSuccess: (result, _vars, context) => {
      pendingCreateTagIds.delete(context.request)
      if (isQueuedResult(result)) return
      if (!context.tempId) return

      syncCreatedTagId(queryClient, context.tempId, result.id)
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateTagMutationQueries(queryClient)
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

      setOptimisticTagDetails(queryClient, tagId, name, color)
      updateHabitTagReferences(queryClient, renameHabitTagReferences(tagId, name, color))

      return { previousLists, previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateTagMutationQueries(queryClient)
    },
  })
}

export function useRestoreTag() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showSuccess, showError } = useAppToast()

  return useMutation({
    mutationFn: async (tagId: string) => {
      const mutation = buildQueuedMutation({
        type: 'restoreTag',
        scope: 'tags',
        endpoint: API.tags.restore(tagId),
        method: 'POST',
        payload: null,
        entityType: 'tag',
        targetEntityId: tagId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.tags.restore(tagId), { method: 'POST' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onSuccess: () => {
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateTagMutationQueries(queryClient)
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreTagMutation = useRestoreTag()
  const showUndoToast = useUndoToast()

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

    onSuccess: (_data, tagId) => {
      showUndoToast(t('undo.tagDeleted'), () => restoreTagMutation.mutate(tagId))
    },

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

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateTagMutationQueries(queryClient)
    },
  })
}

export function useSuggestTags() {
  // react-doctor-disable-next-line query-mutation-missing-invalidation -- Returns AI tag suggestions for the picker; it mutates no persisted state, so there is nothing to invalidate. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  return useMutation({
    mutationFn: ({
      title,
      description,
      language,
    }: {
      title: string
      description: string | null
      language: string
    }) =>
      apiClient<SuggestTagsResponse>(API.tags.suggest, {
        method: 'POST',
        body: JSON.stringify({ title, description, language }),
      }),
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
      const availableTags = getAvailableTags(queryClient)
      const nextTags = resolveHabitTags(availableTags, tagIds)

      setOptimisticAssignedTags(queryClient, habitId, nextTags)

      return { previousHabitLists }
    },

    onError: (_err, _vars, context) => {
      restoreTagMutationContext(queryClient, context)
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateTagMutationQueries(queryClient)
    },
  })
}
