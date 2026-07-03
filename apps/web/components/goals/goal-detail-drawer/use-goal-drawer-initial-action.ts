'use client'

import { useEffect, useRef, useState } from 'react'

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
 *  progress open their surface on the open transition; complete fires the
 *  status mutation exactly once. */
export function useGoalDrawerInitialAction({
  open,
  initialAction,
  openEditModal,
  openDeleteConfirm,
  openProgressForm,
  markCompleted,
}: GoalDrawerInitialActionInput) {
  const [previousActionOpen, setPreviousActionOpen] = useState(false)
  if (previousActionOpen !== open) {
    setPreviousActionOpen(open)
    if (open && initialAction) {
      if (initialAction === 'edit') {
        openEditModal()
      } else if (initialAction === 'delete') {
        openDeleteConfirm()
      } else if (initialAction === 'progress') {
        openProgressForm()
      }
    }
  }

  const completeActionFiredRef = useRef(false)
  useEffect(() => {
    if (!open) {
      completeActionFiredRef.current = false
      return
    }
    if (initialAction === 'complete' && !completeActionFiredRef.current) {
      completeActionFiredRef.current = true
      void markCompleted()
    }
  }, [open, initialAction, markCompleted])
}
