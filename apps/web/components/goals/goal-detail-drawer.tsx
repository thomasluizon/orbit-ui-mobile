'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArchiveX,
  CheckCircle2,
  PencilLine,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { EditGoalModal } from './edit-goal-modal'
import { GoalAskAstraRow } from './goal-ask-astra-row'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalActionRow,
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
  GoalProgressForm,
} from './goal-detail-sections'
import { GoalProgressRing } from './goal-detail-drawer/goal-progress-ring'
import {
  formatLocaleDateTime,
  getFriendlyErrorMessage,
  translateErrorKey,
  validateGoalProgressInput,
} from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useGoals,
  useGoalDetail,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
  useDeleteGoal,
} from '@/hooks/use-goals'

export type GoalDrawerInitialAction = 'edit' | 'complete' | 'delete' | 'progress'

interface GoalDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalId: string
  /** When the drawer opens, immediately deep-link into one of its existing actions
   *  (edit modal, mark-completed, delete confirm, or the progress form). Applied once
   *  per open; omit for the normal view-details open. Lets the goal-card context menu
   *  and the desktop panel CTAs reuse these handlers. */
  initialAction?: GoalDrawerInitialAction | null
}

type ProgressDismissTarget = 'drawer' | 'form'

export function GoalDetailDrawer({
  open,
  onOpenChange,
  goalId,
  initialAction,
}: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const locale = useLocale()
  const { showError } = useAppToast()

  const { data: goalsData } = useGoals()
  const {
    data: detailData,
    isLoading: isLoadingDetail,
    isError: loadError,
    refetch: refetchDetail,
  } = useGoalDetail(open ? goalId : null)

  const updateProgress = useUpdateGoalProgress()
  const updateStatus = useUpdateGoalStatus()
  const deleteGoalMut = useDeleteGoal()

  const detail = detailData?.goal ?? null
  const goal = detail ?? goalsData?.goalsById.get(goalId) ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [progressValue, setProgressValue] = useState<number | null>(null)
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] = useState(false)
  const [initialProgressValue, setInitialProgressValue] = useState<number | null>(null)
  const [pendingProgressDismiss, setPendingProgressDismiss] = useState<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    if (progressValue === null || !goal) return false
    return progressValue > goal.targetValue
  }, [progressValue, goal])

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false
    return (
      progressValue !== initialProgressValue ||
      progressNote.trim().length > 0
    )
  }, [progressNote, progressValue, showProgressForm, initialProgressValue])

  const router = useRouter()
  function handleAskAstra() {
    if (!goal) return
    const seed = t('goals.detail.askAstraSeedDefault', { title: goal.title })
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('orbit-chat-draft', seed)
    }
    onOpenChange(false)
    router.push('/chat')
  }

  const [previousSession, setPreviousSession] = useState<{ open: boolean; goalId: string | null }>({
    open: false,
    goalId: null,
  })
  if (previousSession.open !== open || previousSession.goalId !== (open ? goalId : null)) {
    setPreviousSession({ open, goalId: open ? goalId : null })
    if (open) {
      const nextInitial = goal?.currentValue ?? null
      setInitialProgressValue(nextInitial)
      setPendingProgressDismiss(null)
      setProgressValue(nextInitial)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    }
  }

  const formatDate = useCallback(
    (dateStr: string) => {
      return formatLocaleDateTime(dateStr, locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      })
    },
    [locale],
  )

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

  const markCompleted = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Completed' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const markAbandoned = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const reactivate = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const confirmDelete = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onOpenChange(false)
      setShowDeleteConfirm(false)
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'))
    }
  }, [deleteGoalMut, goalId, onOpenChange, showError, translate])

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

  const [previousActionOpen, setPreviousActionOpen] = useState(false)
  if (previousActionOpen !== open) {
    setPreviousActionOpen(open)
    if (open && initialAction) {
      if (initialAction === 'edit') {
        setShowEditModal(true)
      } else if (initialAction === 'delete') {
        setShowDeleteConfirm(true)
      } else if (initialAction === 'progress') {
        setShowProgressForm(true)
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

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={goal?.title ?? ''}
        canDismiss={!isProgressDirty}
        isDirty={isProgressDirty}
        onAttemptDismiss={() => requestProgressDismiss('drawer')}
        footer={
          goal ? (
            <GoalAskAstraRow
              onClick={handleAskAstra}
              style={{ borderRadius: 8, padding: '8px 10px', margin: '-8px -10px' }}
            />
          ) : undefined
        }
      >
        {goal && (
          <div className="overlay-bleed">
            <div
              className="t-eyebrow"
              style={{
                padding: '10px 20px',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              {isStreak
                ? t('goals.form.typeStreak')
                : `${t('goals.form.typeStandard')}${goal.unit ? `  ·  ${goal.unit}` : ''}`}
            </div>

            <SectionLabel>{t('goals.progress')}</SectionLabel>
            <div style={{ padding: '2px 20px 16px' }}>
              <GoalProgressRing
                progressPercentage={goal.progressPercentage}
                percentLabel={t('goals.progressPercentage', {
                  pct: Math.round(goal.progressPercentage),
                })}
                progressOfLabel={
                  isStreak
                    ? t('goals.streak.ofTarget', {
                        current: goal.currentValue,
                        target: goal.targetValue,
                      })
                    : t('goals.progressOf', {
                        current: goal.currentValue,
                        target: goal.targetValue,
                        unit: goal.unit,
                      })
                }
                color={isStreak ? 'var(--status-overdue)' : 'var(--primary)'}
              />
              {goal.status === 'Active' && !showProgressForm && (
                <div className="flex justify-center">
                  <PillButton
                    fullWidth
                    className="mt-[14px] sm:max-w-[360px]"
                    leading={
                      <Plus
                        size={18}
                        strokeWidth={1.8}
                        color="var(--fg-on-primary)"
                        aria-hidden="true"
                      />
                    }
                    onClick={() => {
                      setInitialProgressValue(goal.currentValue)
                      setProgressValue(goal.currentValue)
                      setProgressNote('')
                      setShowProgressForm(true)
                    }}
                  >
                    {t('goals.updateProgress')}
                  </PillButton>
                </div>
              )}
            </div>

            {showProgressForm && goal.status === 'Active' && (
              <GoalProgressForm
                progressValue={progressValue}
                progressNote={progressNote}
                isUpdating={isUpdatingProgress}
                progressExceedsTarget={progressExceedsTarget}
                onProgressValueChange={setProgressValue}
                onProgressNoteChange={setProgressNote}
                onSubmit={submitProgress}
                onCancel={() => requestProgressDismiss('form')}
                labelValue={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
                labelNote={t('goals.progressNote')}
                labelSave={t('common.save')}
                labelCancel={t('common.cancel')}
                labelExceedsTarget={t('goals.form.progressExceedsTarget')}
              />
            )}

            {goal.status === 'Active' && (
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
                isStreak={isStreak}
              />
            )}

            {isStreak && (goal.linkedHabits ?? []).length > 0 && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            <GoalProgressHistorySection
              title={t('goals.progressHistory')}
              entries={detail?.progressHistory ?? []}
              formatDate={formatDate}
              renderEntryLabel={(entry) =>
                t('goals.progressEntry', {
                  previous: entry.previousValue,
                  value: entry.value,
                  unit: goal.unit,
                })
              }
              showAllLabel={t('goals.detail.showAllHistory')}
              showLessLabel={t('goals.detail.showLessHistory')}
            />

            {!isStreak && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            {loadError && (
              <div style={{ padding: '10px 20px 0' }}>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--status-overdue-text)',
                  }}
                >
                  {t('goals.detail.loadError')}
                </p>
                <button
                  type="button"
                  onClick={() => refetchDetail()}
                  className="inline-flex appearance-none cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--primary)]"
                  style={{
                    minHeight: 44,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            <div style={{ marginTop: 16, paddingBottom: 4 }}>
              {goal.status === 'Active' ? (
                <>
                  <GoalActionRow
                    label={t('goals.detail.markCompleted')}
                    icon={CheckCircle2}
                    onClick={markCompleted}
                    disabled={isUpdatingStatus}
                  />
                  <GoalActionRow
                    label={t('goals.detail.markAbandoned')}
                    icon={ArchiveX}
                    onClick={markAbandoned}
                    disabled={isUpdatingStatus}
                  />
                </>
              ) : (
                <GoalActionRow
                  label={t('goals.detail.reactivate')}
                  icon={RotateCw}
                  onClick={reactivate}
                  disabled={isUpdatingStatus}
                />
              )}
              <GoalActionRow
                label={t('goals.detail.edit')}
                icon={PencilLine}
                onClick={() => setShowEditModal(true)}
              />
              <GoalActionRow
                label={t('goals.detail.delete')}
                icon={Trash2}
                destructive
                onClick={() => setShowDeleteConfirm(true)}
              />
            </div>
          </div>
        )}
      </AppOverlay>

      {goal && (
        <EditGoalModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          goal={goal}
        />
      )}

      <ConfirmDialog
        open={showProgressDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelProgressDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        variant="warning"
        onConfirm={confirmProgressDismiss}
        onCancel={cancelProgressDismiss}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('goals.detail.delete')}
        description={t('goals.detail.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}
