import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
  validateGoalProgressInput,
} from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useAdMob } from '@/hooks/use-ad-mob'
import { useUpdateGoalProgress } from '@/hooks/use-goals'

type ProgressDismissTarget = 'drawer' | 'form'

interface GoalProgressFormStateInput {
  open: boolean
  goalId: string
  goalCurrentValue: number | undefined
  goalTargetValue: number | undefined
  refetchDetail: () => Promise<unknown>
  onClose: () => void
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
  onClose,
}: GoalProgressFormStateInput) {
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const { showInterstitialIfDue } = useAdMob()
  const updateProgress = useUpdateGoalProgress()

  const [progressValue, setProgressValue] = useState(() =>
    open && goalCurrentValue !== undefined ? String(goalCurrentValue) : '',
  )
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] =
    useState(false)
  const pendingProgressDismissRef = useRef<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending

  const progressExceedsTarget = useMemo(() => {
    const numVal = Number(progressValue)
    if (!progressValue || Number.isNaN(numVal) || goalTargetValue === undefined) {
      return false
    }
    return numVal > goalTargetValue
  }, [progressValue, goalTargetValue])

  const [initialProgressValue, setInitialProgressValue] = useState(() =>
    open && goalCurrentValue !== undefined ? String(goalCurrentValue) : '',
  )

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false
    return (
      progressValue !== initialProgressValue || progressNote.trim().length > 0
    )
  }, [initialProgressValue, progressNote, progressValue, showProgressForm])

  const resetKey = open ? `${goalId}:${goalCurrentValue}` : null
  const previousResetKey = useRef(resetKey)
  useEffect(() => {
    if (resetKey === previousResetKey.current) return
    previousResetKey.current = resetKey
    if (open) void Promise.resolve().then(() => {
      const nextInitial =
        goalCurrentValue !== undefined ? String(goalCurrentValue) : ''
      setInitialProgressValue(nextInitial)
      setProgressValue(nextInitial)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    })
  }, [goalCurrentValue, open, resetKey])

  useEffect(() => {
    pendingProgressDismissRef.current = null
  }, [resetKey])

  const submitProgress = useCallback(async () => {
    const validationError = translateErrorKey(
      translate,
      validateGoalProgressInput(progressValue),
    )
    if (validationError) {
      showError(validationError)
      return
    }
    const numVal = Number(progressValue)
    if (!progressValue || Number.isNaN(numVal)) return
    try {
      await updateProgress.mutateAsync({
        goalId,
        data: {
          currentValue: numVal,
          note: progressNote.trim() || undefined,
        },
      })
      setProgressValue('')
      setProgressNote('')
      setShowProgressForm(false)
      await refetchDetail()
      void showInterstitialIfDue()
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          'goals.errors.progress',
          'goalProgress',
        ),
      )
    }
  }, [
    goalId,
    progressNote,
    progressValue,
    refetchDetail,
    showError,
    showInterstitialIfDue,
    translate,
    updateProgress,
  ])

  const closeProgressForm = useCallback(() => {
    setProgressValue(initialProgressValue)
    setProgressNote('')
    setShowProgressForm(false)
  }, [initialProgressValue])

  const openProgressForm = useCallback(() => {
    const nextInitial =
      goalCurrentValue !== undefined ? String(goalCurrentValue) : ''
    setInitialProgressValue(nextInitial)
    setProgressValue(nextInitial)
    setProgressNote('')
    setShowProgressForm(true)
  }, [goalCurrentValue])

  const requestProgressDismiss = useCallback(
    (target: ProgressDismissTarget) => {
      if (isProgressDirty) {
        pendingProgressDismissRef.current = target
        setShowProgressDiscardDialog(true)
        return
      }
      if (target === 'drawer') {
        onClose()
        return
      }
      closeProgressForm()
    },
    [closeProgressForm, isProgressDirty, onClose],
  )

  const confirmProgressDismiss = useCallback(() => {
    const target = pendingProgressDismissRef.current
    pendingProgressDismissRef.current = null
    setShowProgressDiscardDialog(false)
    if (target === 'drawer') {
      onClose()
      return
    }
    closeProgressForm()
  }, [closeProgressForm, onClose])

  const cancelProgressDismiss = useCallback(() => {
    pendingProgressDismissRef.current = null
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
