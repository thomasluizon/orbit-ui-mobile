'use client'

import { collectSelectableDescendantIds } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import type { useHabitListQueries, useHabitListModalState, useHabitListCollapse } from './use-habit-list-state'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useAccountScopedState(false)
  const [deletePending, setDeletePending] = useAccountScopedState(false)
  const [habitToDelete, setHabitToDelete] = useAccountScopedState<{
    id: string; name: string; descendantCount: number
  } | null>(null)
  const [habitToDuplicate, setHabitToDuplicate] = useAccountScopedState<NormalizedHabit | null>(null)
  return { habitToDelete, showDeleteConfirm, deletePending, habitToDuplicate, setHabitToDelete, setShowDeleteConfirm, setHabitToDuplicate, setDeletePending }
}

export function promptDelete(context: HabitListActionsContext, habitId: string) {
  const { setHabitToDelete, habitsById, childrenByParent, setShowDeleteConfirm } = context

  setHabitToDelete({ id: habitId, ...getDeleteConfirmation(habitId, habitsById, childrenByParent) })
  setShowDeleteConfirm(true)
}

export async function confirmDuplicate(context: HabitListActionsContext) {
  const { habitToDuplicate, duplicateHabitMut, setHabitToDuplicate } = context

  if (!habitToDuplicate) return
  try {
    await duplicateHabitMut.mutateAsync(habitToDuplicate.id)
  } catch {
  } finally {
    setHabitToDuplicate(null)
  }
}

export function startAddSubHabit(context: HabitListActionsContext, parent: NormalizedHabit) {
  const { isOnline, setRefusedSubHabitParentId, collapsedIds, toggleExpand, setSubHabitParent, setShowSubHabitModal } = context

  const parentId = parent.id
  if (!isOnline) { setRefusedSubHabitParentId(parentId); return }
  if (collapsedIds.has(parentId)) toggleExpand(parentId)
  setSubHabitParent(parent)
  setShowSubHabitModal(true)
}

export async function confirmDelete(context: HabitListActionsContext) {
  const { habitToDelete, setDeletePending, setShowDeleteConfirm, deleteHabitMut } = context

  if (!habitToDelete) return
  setDeletePending(true)
  setShowDeleteConfirm(false)
  try {
    await deleteHabitMut.mutateAsync(habitToDelete.id)
  } catch {
  } finally {
    setDeletePending(false)
  }
}

type HabitListActionsContext = Pick<ReturnType<typeof useHabitListConfirmState>, 'setHabitToDelete' | 'setShowDeleteConfirm' | 'habitToDuplicate' | 'setHabitToDuplicate' | 'habitToDelete' | 'setDeletePending'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent' | 'duplicateHabitMut' | 'isOnline' | 'deleteHabitMut'> & Pick<ReturnType<typeof useHabitListModalState>, 'setRefusedSubHabitParentId' | 'setSubHabitParent' | 'setShowSubHabitModal'> & Pick<ReturnType<typeof useHabitListCollapse>, 'collapsedIds' | 'toggleExpand'>

export function createHabitListActions(context: HabitListActionsContext) {
  return { promptDelete: promptDelete.bind(null, context), confirmDuplicate: confirmDuplicate.bind(null, context), startAddSubHabit: startAddSubHabit.bind(null, context), confirmDelete: confirmDelete.bind(null, context) }
}
