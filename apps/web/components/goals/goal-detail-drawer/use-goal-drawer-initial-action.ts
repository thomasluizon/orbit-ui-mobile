'use client'

import { useEffect, useRef } from 'react'

export type GoalDrawerInitialAction = 'edit' | 'complete' | 'delete' | 'progress'

interface GoalDrawerInitialActionInput {
  open: boolean
  initialAction: GoalDrawerInitialAction | null | undefined
  openEditModal: () => void
  openDeleteConfirm: () => void
  openProgressForm: () => void
  markCompleted: () => Promise<void>
}

/** Applies the drawer's deep-link action once per open: edit, delete, and
 *  progress open their surface once the drawer commits; complete fires the
 *  status mutation exactly once. */
export function useGoalDrawerInitialAction({
  open,
  initialAction,
  openEditModal,
  openDeleteConfirm,
  openProgressForm,
  markCompleted,
}: GoalDrawerInitialActionInput) {
  const actionFiredRef = useRef(false)
  useEffect(() => {
    if (!open) {
      actionFiredRef.current = false
      return
    }
    if (actionFiredRef.current || !initialAction) return
    actionFiredRef.current = true
    if (initialAction === 'edit') {
      openEditModal()
    } else if (initialAction === 'delete') {
      openDeleteConfirm()
    } else if (initialAction === 'progress') {
      openProgressForm()
    } else {
      void markCompleted()
    }
  }, [
    open,
    initialAction,
    openEditModal,
    openDeleteConfirm,
    openProgressForm,
    markCompleted,
  ])
}
