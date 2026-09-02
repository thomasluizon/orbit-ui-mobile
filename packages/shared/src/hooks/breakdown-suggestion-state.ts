'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { SuggestedSubHabit } from '../types/chat'
import type { BulkCreateRequest, BulkCreateResponse } from '../types/habit'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
  nextBreakdownCadence,
  type BreakdownEditableHabit,
} from '../utils/breakdown-suggestion'

export type BreakdownDraftHabit = BreakdownEditableHabit & { id: string }
export type BreakdownItemResult = 'done' | 'failed' | undefined

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

function toDraftHabit(habit: SuggestedSubHabit, index: number): BreakdownDraftHabit {
  return {
    id: `proposal-${index}`,
    title: habit.title,
    description: habit.description ?? '',
    frequencyUnit: habit.frequencyUnit ?? null,
    frequencyQuantity: habit.frequencyQuantity ?? null,
    days: habit.days ?? null,
    isBadHabit: habit.isBadHabit ?? false,
    dueDate: habit.dueDate ?? null,
    checklistItems: habit.checklistItems ?? null,
  }
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
    subHabits.map(toDraftHabit),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, BreakdownItemResult>>({})
  const failedIds = habits
    .filter((habit) => results[habit.id] === 'failed')
    .map((habit) => habit.id)

  const editTitle = useCallback((id: string, title: string) => {
    setHabits((current) => current.map((habit) =>
      habit.id === id ? { ...habit, title } : habit,
    ))
  }, [])

  const cycleCadence = useCallback((id: string) => {
    setHabits((current) => current.map((habit) =>
      habit.id === id
        ? { ...habit, frequencyUnit: nextBreakdownCadence(habit.frequencyUnit) }
        : habit,
    ))
  }, [])

  const submit = useCallback(async (onlyIds?: readonly string[]) => {
    const selected = onlyIds
      ? habits.filter((habit) => onlyIds.includes(habit.id))
      : habits
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0) return

    try {
      const response = await onBulkCreate(buildBreakdownCreateRequest(valid, parentName, false))
      const nextResults = { ...results }
      response.results.forEach((result) => {
        const habit = selected[result.index]
        if (habit) nextResults[habit.id] = result.status === 'Success' ? 'done' : 'failed'
      })
      setResults(nextResults)
      if (response.results.every((result) => result.status === 'Success')) onConfirmed()
    } catch {
      setResults((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((habit) => [habit.id, 'failed'])),
      }))
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
