'use client'

import { useEffect, useRef } from 'react'

export type GoalDrawerInitialAction = 'edit' | 'delete' | 'progress'

interface GoalDrawerInitialActionInput {
  open: boolean
  initialAction: GoalDrawerInitialAction | null | undefined
  openEditModal: () => void
  openDeleteConfirm: () => void
  openProgressForm: () => void
}

/** Applies the drawer's deep-link action once per open. */
export function useGoalDrawerInitialAction({
  open,
  initialAction,
  openEditModal,
  openDeleteConfirm,
  openProgressForm,
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
    } else {
      openProgressForm()
    }
  }, [
    open,
    initialAction,
    openEditModal,
    openDeleteConfirm,
    openProgressForm,
  ])
}
