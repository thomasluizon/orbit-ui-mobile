import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { userFactKeys } from '@orbit/shared/query'
import { USER_FACTS_PER_PAGE } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOffline } from '@/hooks/use-offline'

export interface UserFact {
  id: string
  factText: string
  category: string | null
}

export function useUserFacts(hasProAccess: boolean) {
  const queryClient = useQueryClient()
  const { isOnline } = useOffline()

  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: () => apiClient<UserFact[]>(API.userFacts.list),
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const facts = useMemo(
    () => (hasProAccess ? (factsQuery.data ?? []) : []),
    [factsQuery.data, hasProAccess],
  )

  const [selectMode, setSelectMode] = useState(false)
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set())

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      performQueuedApiMutation({
        type: 'deleteUserFact',
        scope: 'userFacts',
        endpoint: API.userFacts.delete(id),
        method: 'DELETE',
        payload: undefined,
        targetEntityId: id,
        dedupeKey: `user-fact-delete-${id}`,
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: userFactKeys.lists() })
      const previous = queryClient.getQueryData<UserFact[]>(
        userFactKeys.lists(),
      )
      queryClient.setQueryData<UserFact[]>(userFactKeys.lists(), (old) =>
        old ? old.filter((fact) => fact.id !== id) : old,
      )
      return { previous }
    },
    onError: (_err, _id, context: { previous?: UserFact[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(userFactKeys.lists(), context.previous)
      }
    },
    onSuccess: () => {
      if (isOnline) {
        void queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      }
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      performQueuedApiMutation({
        type: 'bulkDeleteUserFacts',
        scope: 'userFacts',
        endpoint: API.userFacts.bulk,
        method: 'DELETE',
        payload: { ids },
        dedupeKey: 'bulk-delete-user-facts',
      }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: userFactKeys.lists() })
      const previous = queryClient.getQueryData<UserFact[]>(
        userFactKeys.lists(),
      )
      const idsToDelete = new Set(ids)
      queryClient.setQueryData<UserFact[]>(userFactKeys.lists(), (old) =>
        old ? old.filter((fact) => !idsToDelete.has(fact.id)) : old,
      )
      return { previous }
    },
    onError: (_err, _ids, context: { previous?: UserFact[] } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(userFactKeys.lists(), context.previous)
      }
    },
    onSuccess: () => {
      if (isOnline) {
        void queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      }
      setSelectedFactIds(new Set())
      const remaining =
        queryClient.getQueryData<UserFact[]>(userFactKeys.lists()) ?? []
      if (remaining.length === 0) setSelectMode(false)
    },
  })

  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / USER_FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * USER_FACTS_PER_PAGE
    return facts.slice(start, start + USER_FACTS_PER_PAGE)
  }, [facts, factsPage])

  if (factsPage > totalFactsPages && totalFactsPages >= 1) {
    setFactsPage(totalFactsPages)
  }

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setSelectedFactIds(new Set())
  }

  function toggleFactSelection(id: string) {
    const next = new Set(selectedFactIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedFactIds(next)
  }

  function toggleSelectAll() {
    if (selectedFactIds.size === facts.length) {
      setSelectedFactIds(new Set())
    } else {
      setSelectedFactIds(new Set(facts.map((fact) => fact.id)))
    }
  }

  return {
    factsQuery,
    facts,
    pagedFacts,
    selectMode,
    selectedFactIds,
    deleteMutation,
    bulkDeleteMutation,
    factsPage,
    setFactsPage,
    totalFactsPages,
    toggleSelectMode,
    toggleFactSelection,
    toggleSelectAll,
  }
}
