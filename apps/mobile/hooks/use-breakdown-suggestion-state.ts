import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import type { SuggestedSubHabit } from '@orbit/shared/types/chat'
import { createBreakdownDraft, createBreakdownDrafts, editBreakdownTitle, cycleBreakdownCadence, mergeBreakdownResults, getFailedBreakdownIds, selectBreakdownHabits, failBreakdownResults, type BreakdownDraftHabit, type BreakdownItemResult } from '@orbit/shared/hooks'
import type { BulkCreateRequest, BulkCreateResponse } from '@orbit/shared/types/habit'
import {
  buildBreakdownCreateRequest,
  createClientId,
  filterValidBreakdownHabits,
  isPayGateError,
  isBreakdownNoWriteRejection,
} from '@orbit/shared/utils'

interface BreakdownSuggestionState {
  capacityDenied: boolean
  addHabit: () => void
  atCapacity: boolean
  createError: boolean
  removalId: string | null
  setRemovalId: Dispatch<SetStateAction<string | null>>
  removeHabit: () => void
  hasSubmitted: boolean
  createAsParent: boolean
  completed: boolean
  groupingDenied: boolean
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
  const [removalId, setRemovalId] = useState<string | null>(null)
  const [capacityDenied, setCapacityDenied] = useState(false)
  const [createError, setCreateError] = useState(false)
  const [createAsParent, setCreateAsParent] = useState(false)
  const [groupingDenied, setGroupingDenied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, BreakdownItemResult>>({})
  const failedIds = getFailedBreakdownIds(habits, results)
  const groupingLocked = isSubmitting || Object.keys(results).length > 0
  const validHabits = filterValidBreakdownHabits(habits)
  const completed = validHabits.length > 0 && validHabits.every((habit) => results[habit.id] === 'done')

  const hasSubmitted = Object.keys(results).length > 0

  const addHabit = () => {
    if (habits.length >= MAX_BULK_OPERATION_SIZE || groupingLocked) return
    const habit = createBreakdownDraft(createClientId('breakdown'))
    setHabits((current) => current.length >= MAX_BULK_OPERATION_SIZE ? current : [...current, habit])
    setEditingId(habit.id)
  }

  const removeHabit = () => {
    if (groupingLocked || removalId == null) return
    setHabits((current) => current.filter((habit) => habit.id !== removalId))
    if (editingId === removalId) setEditingId(null)
    setRemovalId(null)
  }

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
    if (valid.length === 0 || valid.length > MAX_BULK_OPERATION_SIZE || valid.every((habit) => results[habit.id] === 'done')) return
    setCreateError(false)
    setCapacityDenied(false)
    setEditingId(null)
    setHabits((current) => filterValidBreakdownHabits(current))

    setGroupingDenied(false)
    setIsSubmitting(true)
    try {
      const response = await onBulkCreate(buildBreakdownCreateRequest(valid, parentName, createAsParent))
      const nextResults = mergeBreakdownResults(results, valid, response, createAsParent)
      if (!createAsParent && !hasSubmitted && !Object.values(nextResults).includes('done')) {
        setResults({})
        setCreateError(true)
        return
      }
      setResults(nextResults)
      if (valid.every((habit) => nextResults[habit.id] === 'done')) onConfirmed()
    } catch (error) {
      setCreateError(true)
      if (isBreakdownNoWriteRejection(error) && Object.keys(results).length === 0) {
        const groupingRejection = createAsParent && isPayGateError(error)
        const capacityRejection = !isPayGateError(error)
        setGroupingDenied(groupingRejection)
        setCapacityDenied(capacityRejection)
        setCreateError(!groupingRejection && !capacityRejection)
      } else {
        setResults((current) => failBreakdownResults(current, valid))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [createAsParent, habits, hasSubmitted, isSubmitting, onBulkCreate, onConfirmed, parentName, rejected, results])

  return {
    removalId,
    setRemovalId,
    capacityDenied,
    addHabit,
    atCapacity: habits.length >= MAX_BULK_OPERATION_SIZE,
    createError,
    removeHabit,
    hasSubmitted,
    createAsParent,
    completed,
    groupingDenied,
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
