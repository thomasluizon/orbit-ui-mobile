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

type ConfirmationQueries = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent' | 'deleteMutation' | 'duplicateMutation'>

export function useHabitListConfirmations({ queries }: { queries: ConfirmationQueries }) {
  const { habitsById, childrenByParent, deleteMutation, duplicateMutation } = queries
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<{ id: string; name: string; descendantCount: number } | null>(null)
  const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
  const promptDelete = useCallback((habitId: string) => {
    setHabitToDelete({ id: habitId, ...getDeleteConfirmation(habitId, habitsById, childrenByParent) })
    setShowDeleteConfirm(true)
  }, [habitsById, childrenByParent, setHabitToDelete, setShowDeleteConfirm])
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
  const confirmDuplicate = useCallback(async () => {
    if (!habitToDuplicate) return
    try {
      await duplicateMutation.mutateAsync(habitToDuplicate.id)
    } catch {
    } finally {
      setHabitToDuplicate(null)
    }
  }, [duplicateMutation, habitToDuplicate, setHabitToDuplicate])
  const closeDelete = () => setHabitToDelete(null)
  const cancelDelete = () => { setHabitToDelete(null); setShowDeleteConfirm(false) }
  const cancelDuplicate = () => setHabitToDuplicate(null)
  const deleteConfirmation = habitToDelete ?? { name: '', descendantCount: 0 }
  return { showDeleteConfirm, deletePending, habitToDuplicate, deleteConfirmation, promptDelete,
    promptDuplicate: setHabitToDuplicate, confirmDelete, confirmDuplicate, closeDelete, cancelDelete, cancelDuplicate }
}
