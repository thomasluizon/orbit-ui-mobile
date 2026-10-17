import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import { createBreakdownDrafts, editBreakdownTitle, cycleBreakdownCadence, mergeBreakdownResults, getFailedBreakdownIds, selectBreakdownHabits, failBreakdownResults, type BreakdownDraftHabit, type BreakdownItemResult } from '@orbit/shared/hooks'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
} from '@orbit/shared/utils'

interface BreakdownSuggestionState {
  createAsParent: boolean
  completed: boolean
  groupingLocked: boolean
  isSubmitting: boolean
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
  setCreateAsParent: (checked: boolean) => void
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
  const [createAsParent, setCreateAsParent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, BreakdownItemResult>>({})
  const failedIds = getFailedBreakdownIds(habits, results)
  const groupingLocked = isSubmitting || Object.keys(results).length > 0
  const validHabits = filterValidBreakdownHabits(habits)
  const completed = validHabits.length > 0 && validHabits.every((habit) => results[habit.id] === 'done')

  const editTitle = useCallback((id: string, title: string) => {
    setHabits((current) => editBreakdownTitle(current, id, title))
  }, [])

  const cycleCadence = useCallback((id: string) => {
    setHabits((current) => cycleBreakdownCadence(current, id))
  }, [])

  const submit = useCallback(async (onlyIds?: readonly string[]) => {
    if (isSubmitting || rejected) return
    const selected = selectBreakdownHabits(habits, onlyIds)
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0 || valid.every((habit) => results[habit.id] === 'done')) return

    setIsSubmitting(true)
    try {
      const response = await onBulkCreate(buildBreakdownCreateRequest(valid, parentName, createAsParent))
      const nextResults = mergeBreakdownResults(results, valid, response, createAsParent)
      setResults(nextResults)
      if (valid.every((habit) => nextResults[habit.id] === 'done')) onConfirmed()
    } catch {
      setResults((current) => failBreakdownResults(current, valid))
    } finally {
      setIsSubmitting(false)
    }
  }, [createAsParent, habits, isSubmitting, onBulkCreate, onConfirmed, parentName, rejected, results])

  return {
    createAsParent,
    completed,
    groupingLocked,
    isSubmitting,
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
    setCreateAsParent: (checked) => { if (!groupingLocked) setCreateAsParent(checked) },
    setConfirmOpen,
    setEditingId,
    submit,
  }
}
