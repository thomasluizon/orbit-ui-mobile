'use client'

import { useCallback } from 'react'
import { collectSelectableDescendantIds } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { useHabitListQueries,useHabitListModalState,useHabitListCollapse } from './use-habit-list-state'

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

type ConfirmationQueries = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent' | 'deleteHabitMut' | 'duplicateHabitMut'>

export function useHabitListConfirmations(queries: { queries: ConfirmationQueries }['queries']) {
  const { habitsById, childrenByParent, deleteHabitMut, duplicateHabitMut } = queries
  const [showDeleteConfirm, setShowDeleteConfirm] = useAccountScopedState(false)
  const [deletePending, setDeletePending] = useAccountScopedState(false)
  const [habitToDelete, setHabitToDelete] = useAccountScopedState<{ id: string; name: string; descendantCount: number } | null>(null)
  const [habitToDuplicate, setHabitToDuplicate] = useAccountScopedState<NormalizedHabit | null>(null)
  const promptDelete = useCallback((habitId: string) => {
    setHabitToDelete({ id: habitId, ...getDeleteConfirmation(habitId, habitsById, childrenByParent) })
    setShowDeleteConfirm(true)
  }, [habitsById, childrenByParent, setHabitToDelete, setShowDeleteConfirm])
  const confirmDelete = useCallback(async () => {
    if (!habitToDelete) return
    setDeletePending(true)
    setShowDeleteConfirm(false)
    try {
      await deleteHabitMut.mutateAsync(habitToDelete.id)
    } catch {
    } finally {
      setDeletePending(false)
    }
  }, [deleteHabitMut, habitToDelete, setDeletePending, setShowDeleteConfirm])
  const confirmDuplicate = useCallback(async () => {
    if (!habitToDuplicate) return
    try {
      await duplicateHabitMut.mutateAsync(habitToDuplicate.id)
    } catch {
    } finally {
      setHabitToDuplicate(null)
    }
  }, [duplicateHabitMut, habitToDuplicate, setHabitToDuplicate])
  const closeDelete = () => setHabitToDelete(null)
  const cancelDelete = () => { setHabitToDelete(null); setShowDeleteConfirm(false) }
  const cancelDuplicate = () => setHabitToDuplicate(null)
  const deleteConfirmation = habitToDelete ?? { name: '', descendantCount: 0 }
  return { showDeleteConfirm, deletePending, habitToDuplicate, deleteConfirmation, promptDelete,
    promptDuplicate: setHabitToDuplicate, confirmDelete, confirmDuplicate, closeDelete, cancelDelete, cancelDuplicate }
}

function startAddSubHabit(context: SubHabitInputs, parent: NormalizedHabit) {
  const { isOnline, setRefusedSubHabitParentId, collapsedIds, toggleExpand, setSubHabitParent, setShowSubHabitModal } = context

  const parentId = parent.id
  if (!isOnline) { setRefusedSubHabitParentId(parentId); return }
  if (collapsedIds.has(parentId)) toggleExpand(parentId)
  setSubHabitParent(parent)
  setShowSubHabitModal(true)
}

type SubHabitInputs = Pick<ReturnType<typeof useHabitListQueries>, 'isOnline'> & Pick<ReturnType<typeof useHabitListModalState>, 'setRefusedSubHabitParentId' | 'setSubHabitParent' | 'setShowSubHabitModal'> & Pick<ReturnType<typeof useHabitListCollapse>, 'collapsedIds' | 'toggleExpand'>

export function createHabitListSubHabitActions(context: SubHabitInputs) {
  return { startAddSubHabit: startAddSubHabit.bind(null, context) }
}
