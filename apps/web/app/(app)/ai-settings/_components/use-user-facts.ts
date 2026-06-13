'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userFactKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { USER_FACTS_PER_PAGE } from '@orbit/shared/utils'
import { bulkDeleteUserFacts, deleteUserFact } from '@/app/actions/user-facts'
import type { UserFact } from '@orbit/shared/types/user-fact'

async function fetchUserFacts(): Promise<UserFact[]> {
  const res = await fetch(API.userFacts.list)
  if (!res.ok) {
    throw new Error('Failed to load user facts')
  }
  return res.json()
}

export function useUserFacts(hasProAccess: boolean) {
  const queryClient = useQueryClient()

  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: fetchUserFacts,
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const facts = useMemo(
    () => (hasProAccess ? (factsQuery.data ?? []) : []),
    [hasProAccess, factsQuery.data],
  )

  const [selectMode, setSelectMode] = useState(false)
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set())

  const deleteMutation = useMutation({
    mutationFn: deleteUserFact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteUserFacts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      setSelectedFactIds(new Set())
      if (facts.length === 0) setSelectMode(false)
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

  if (factsPage > totalFactsPages) {
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
