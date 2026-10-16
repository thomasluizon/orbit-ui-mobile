'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import { createBreakdownDraft, createBreakdownDrafts, editBreakdownTitle, cycleBreakdownCadence, mergeBreakdownResults, getFailedBreakdownIds, selectBreakdownHabits, failBreakdownResults, type BreakdownDraftHabit, type BreakdownItemResult } from '@orbit/shared/hooks'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  createClientId,
  filterValidBreakdownHabits,
} from '@orbit/shared/utils'

interface BreakdownSuggestionState {
  addHabit: () => void
  atCapacity: boolean
  createError: boolean
  removeHabit: (id: string) => void
  hasSubmitted: boolean
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
  const [createError, setCreateError] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, BreakdownItemResult>>({})
  const failedIds = getFailedBreakdownIds(habits, results)

  const hasSubmitted = Object.keys(results).length > 0

  const addHabit = () => {
    if (habits.length >= MAX_BULK_OPERATION_SIZE || hasSubmitted) return
    const habit = createBreakdownDraft(createClientId('breakdown'))
    setHabits((current) => current.length >= MAX_BULK_OPERATION_SIZE ? current : [...current, habit])
    setEditingId(habit.id)
  }

  const removeHabit = (id: string) => {
    if (hasSubmitted) return
    setHabits((current) => current.filter((habit) => habit.id !== id))
    setEditingId(habits.find((habit) => habit.id !== id)?.id ?? null)
  }

  const editTitle = useCallback((id: string, title: string) => {
    setHabits((current) => editBreakdownTitle(current, id, title))
  }, [])

  const cycleCadence = useCallback((id: string) => {
    setHabits((current) => cycleBreakdownCadence(current, id))
  }, [])

  const submit = useCallback(async (onlyIds?: readonly string[]) => {
    const selected = selectBreakdownHabits(habits, onlyIds)
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0 || valid.length > MAX_BULK_OPERATION_SIZE) return
    setCreateError(false)
    setEditingId(null)
    setHabits((current) => filterValidBreakdownHabits(current))

    try {
      const response = await onBulkCreate(buildBreakdownCreateRequest(valid, parentName, false))
      const nextResults = mergeBreakdownResults(results, valid, response)
      if (!Object.values(nextResults).includes('done')) {
        setResults({})
        setCreateError(true)
        return
      }
      setResults(nextResults)
      if (response.results.every((result) => result.status === 'Success')) onConfirmed()
    } catch {
      setCreateError(true)
      if (hasSubmitted) setResults((current) => failBreakdownResults(current, valid))
    }
  }, [habits, hasSubmitted, onBulkCreate, onConfirmed, parentName, results])

  return {
    addHabit,
    atCapacity: habits.length >= MAX_BULK_OPERATION_SIZE,
    createError,
    removeHabit,
    hasSubmitted,
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
