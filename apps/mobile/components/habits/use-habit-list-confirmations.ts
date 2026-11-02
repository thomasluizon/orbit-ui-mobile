import { useCallback, useState } from 'react'
import { collectSelectableDescendantIds } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useHabitListQueries } from './use-habit-list-state'

function getDeleteConfirmation(
  habitId: string | null,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  childrenByParent: ReadonlyMap<string, string[]>,
) {
  if (!habitId) return { name: '', descendantCount: 0 }
  return {
    name: habitsById.get(habitId)?.title ?? '',
    descendantCount: collectSelectableDescendantIds(
      habitId,
      (descendantId) => childrenByParent.get(descendantId) ?? [],
    ).length,
  }
}

export function useHabitListConfirmState() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<{
    id: string; name: string; descendantCount: number
  } | null>(null)
  const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
  return { habitToDelete, setHabitToDelete, setShowDeleteConfirm, habitToDuplicate, setHabitToDuplicate, setDeletePending, showDeleteConfirm, deletePending }
}

type HabitListDeletePromptInputs = Pick<ReturnType<typeof useHabitListConfirmState>, 'setHabitToDelete' | 'setShowDeleteConfirm'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent'>

export function useHabitListDeletePrompt({ setHabitToDelete, habitsById, childrenByParent, setShowDeleteConfirm }: HabitListDeletePromptInputs) {
  const promptDelete = useCallback((habitId: string) => {
    setHabitToDelete({ id: habitId, ...getDeleteConfirmation(habitId, habitsById, childrenByParent) })
    setShowDeleteConfirm(true)
  }, [setHabitToDelete, habitsById, childrenByParent, setShowDeleteConfirm])
  return { promptDelete }
}

type HabitListDuplicateInputs = Pick<ReturnType<typeof useHabitListConfirmState>, 'habitToDuplicate' | 'setHabitToDuplicate'> & Pick<ReturnType<typeof useHabitListQueries>, 'duplicateMutation'>

export function useHabitListDuplicate({ habitToDuplicate, duplicateMutation, setHabitToDuplicate }: HabitListDuplicateInputs) {
  const confirmDuplicate = useCallback(async () => {
    if (!habitToDuplicate) return
    try {
      await duplicateMutation.mutateAsync(habitToDuplicate.id)
    } catch {
    } finally {
      setHabitToDuplicate(null)
    }
  }, [duplicateMutation, habitToDuplicate, setHabitToDuplicate])
  return { confirmDuplicate }
}

type HabitListDeleteInputs = Pick<ReturnType<typeof useHabitListConfirmState>, 'habitToDelete' | 'setDeletePending' | 'setShowDeleteConfirm'> & Pick<ReturnType<typeof useHabitListQueries>, 'deleteMutation'>

export function useHabitListDelete({ habitToDelete, setDeletePending, setShowDeleteConfirm, deleteMutation }: HabitListDeleteInputs) {
  const confirmDelete = useCallback(async () => {
    if (!habitToDelete) return

    setDeletePending(true)
    setShowDeleteConfirm(false)

    try {
      await deleteMutation.mutateAsync(habitToDelete.id)
    } catch {
    } finally {
      setDeletePending(false)
    }
  }, [deleteMutation, habitToDelete, setDeletePending, setShowDeleteConfirm])
  return { confirmDelete }
}
