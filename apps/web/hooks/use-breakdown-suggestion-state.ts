'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import { createBreakdownDrafts, editBreakdownTitle, cycleBreakdownCadence, mergeBreakdownResults, getFailedBreakdownIds, selectBreakdownHabits, failBreakdownResults, type BreakdownDraftHabit, type BreakdownItemResult } from '@orbit/shared/hooks'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
} from '@orbit/shared/utils'

interface BreakdownSuggestionState {
  confirmOpen: boolean
  editingId: string | null
  failedIds: string[]
  habits: BreakdownDraftHabit[]
  partiallyFailed: boolean
  rejected: boolean
  results: Record<string, BreakdownItemResult>
  cycleCadence: (id: string) => void
  editTitle: (id: string, title: string) => void
  reject: () => void
  setConfirmOpen: Dispatch<SetStateAction<boolean>>
  setEditingId: Dispatch<SetStateAction<string | null>>
  submit: (onlyIds?: readonly string[]) => Promise<void>
}

export function useBreakdownSuggestionState({
  subHabits,
  parentName,
  onBulkCreate,
  onConfirmed,
}: Readonly<{
  subHabits: readonly SuggestedSubHabit[]
  parentName: string
  onBulkCreate: (request: BulkCreateRequest) => Promise<BulkCreateResponse>
  onConfirmed: () => void
}>): BreakdownSuggestionState {
  const [habits, setHabits] = useState<BreakdownDraftHabit[]>(() =>
    createBreakdownDrafts(subHabits),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, BreakdownItemResult>>({})
  const failedIds = getFailedBreakdownIds(habits, results)

  const editTitle = useCallback((id: string, title: string) => {
    setHabits((current) => editBreakdownTitle(current, id, title))
  }, [])

  const cycleCadence = useCallback((id: string) => {
    setHabits((current) => cycleBreakdownCadence(current, id))
  }, [])

  const submit = useCallback(async (onlyIds?: readonly string[]) => {
    const selected = selectBreakdownHabits(habits, onlyIds)
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0) return

    try {
      const response = await onBulkCreate(buildBreakdownCreateRequest(valid, parentName, false))
      const nextResults = mergeBreakdownResults(results, selected, response)
      setResults(nextResults)
      if (response.results.every((result) => result.status === 'Success')) onConfirmed()
    } catch {
      setResults((current) => failBreakdownResults(current, selected))
    }
  }, [habits, onBulkCreate, onConfirmed, parentName, results])

  return {
    confirmOpen,
    editingId,
    failedIds,
    habits,
    partiallyFailed: failedIds.length > 0,
    rejected,
    results,
    cycleCadence,
    editTitle,
    reject: () => setRejected(true),
    setConfirmOpen,
    setEditingId,
    submit,
  }
}
