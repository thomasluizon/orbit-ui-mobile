'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
  validateGoalProgressInput,
} from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUpdateGoalProgress } from '@/hooks/use-goals'

type ProgressDismissTarget = 'drawer' | 'form'

interface GoalProgressFormStateInput {
  open: boolean
  goalId: string
  goalCurrentValue: number | undefined
  goalTargetValue: number | undefined
  refetchDetail: () => void
  onOpenChange: (open: boolean) => void
}

/** Owns the drawer's inline progress-update form: field state, dirty tracking,
 *  the discard-confirmation flow for dismissing the form or the whole drawer,
 *  the reset-on-open session snapshot, and the progress mutation submit. */
export function useGoalProgressFormState({
  open,
  goalId,
  goalCurrentValue,
  goalTargetValue,
  refetchDetail,
  onOpenChange,
}: GoalProgressFormStateInput) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const updateProgress = useUpdateGoalProgress()

  const [progressValue, setProgressValue] = useState<number | null>(null)
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] = useState(false)
  const [initialProgressValue, setInitialProgressValue] = useState<number | null>(null)
  const [pendingProgressDismiss, setPendingProgressDismiss] = useState<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending

  const progressExceedsTarget = useMemo(() => {
    if (progressValue === null || goalTargetValue === undefined) return false
    return progressValue > goalTargetValue
  }, [progressValue, goalTargetValue])

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false
    return (
      progressValue !== initialProgressValue ||
      progressNote.trim().length > 0
    )
  }, [progressNote, progressValue, showProgressForm, initialProgressValue])

  const [previousSession, setPreviousSession] = useState<{ open: boolean; goalId: string | null }>({
    open: false,
    goalId: null,
  })
  if (previousSession.open !== open || previousSession.goalId !== (open ? goalId : null)) {
    setPreviousSession({ open, goalId: open ? goalId : null })
    if (open) {
      const nextInitial = goalCurrentValue ?? null
      setInitialProgressValue(nextInitial)
      setPendingProgressDismiss(null)
      setProgressValue(nextInitial)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    }
  }

  const openProgressForm = useCallback(() => {
    const nextInitial = goalCurrentValue ?? null
    setInitialProgressValue(nextInitial)
    setProgressValue(nextInitial)
    setProgressNote('')
    setShowProgressForm(true)
  }, [goalCurrentValue])

  const submitProgress = useCallback(async () => {
    const validationError = translateErrorKey(
      translate,
      validateGoalProgressInput(progressValue),
    )
    if (validationError) {
      showError(validationError)
      return
    }

    if (progressValue === null) return
    try {
      await updateProgress.mutateAsync({
        goalId,
        data: {
          currentValue: progressValue,
          note: progressNote.trim() || undefined,
        },
      })
      setProgressValue(null)
      setProgressNote('')
      setShowProgressForm(false)
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.progress', 'goalProgress'))
    }
  }, [goalId, progressNote, progressValue, refetchDetail, showError, translate, updateProgress])

  const closeProgressForm = useCallback(() => {
    setProgressValue(initialProgressValue)
    setProgressNote('')
    setShowProgressForm(false)
  }, [initialProgressValue])

  const requestProgressDismiss = useCallback((target: ProgressDismissTarget) => {
    if (isProgressDirty) {
      setPendingProgressDismiss(target)
      setShowProgressDiscardDialog(true)
      return
    }

    if (target === 'drawer') {
      onOpenChange(false)
      return
    }

    closeProgressForm()
  }, [closeProgressForm, isProgressDirty, onOpenChange])

  const confirmProgressDismiss = useCallback(() => {
    const target = pendingProgressDismiss
    setPendingProgressDismiss(null)
    setShowProgressDiscardDialog(false)

    if (target === 'drawer') {
      onOpenChange(false)
      return
    }

    closeProgressForm()
  }, [closeProgressForm, onOpenChange, pendingProgressDismiss])

  const cancelProgressDismiss = useCallback(() => {
    setPendingProgressDismiss(null)
    setShowProgressDiscardDialog(false)
  }, [])

  return {
    progressValue,
    setProgressValue,
    progressNote,
    setProgressNote,
    showProgressForm,
    showProgressDiscardDialog,
    isProgressDirty,
    progressExceedsTarget,
    isUpdatingProgress,
    openProgressForm,
    submitProgress,
    requestProgressDismiss,
    confirmProgressDismiss,
    cancelProgressDismiss,
  }
}
