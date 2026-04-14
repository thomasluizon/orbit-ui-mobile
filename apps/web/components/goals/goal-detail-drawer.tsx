'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  PencilLine,
  CheckCircle2,
  ArchiveX,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalActionButton,
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
  GoalProgressForm,
} from './goal-detail-sections'
import {
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalId: string
}

type ProgressDismissTarget = 'drawer' | 'form'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalDetailDrawer({
  open,
  onOpenChange,
  goalId,
}: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { showError } = useAppToast()

  // Queries
  const { data: goalsData } = useGoals()
  const {
    data: detailData,
    isLoading: isLoadingDetail,
    isError: loadError,
    refetch: refetchDetail,
  } = useGoalDetail(open ? goalId : null)

  // Mutations
  const updateProgress = useUpdateGoalProgress()
  const updateStatus = useUpdateGoalStatus()
  const deleteGoalMut = useDeleteGoal()

  // Get goal from list cache for immediate display
  const goal = goalsData?.goalsById.get(goalId) ?? null
  const detail = detailData?.goal ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  // Local state
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [progressValue, setProgressValue] = useState<number | null>(null)
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] = useState(false)
  const initialProgressValueRef = useRef<number | null>(null)
  const pendingProgressDismissRef = useRef<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    if (progressValue === null || !goal) return false
    return progressValue > goal.targetValue
  }, [progressValue, goal])

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false

    return (
      progressValue !== initialProgressValueRef.current ||
      progressNote.trim().length > 0
    )
  }, [progressNote, progressValue, showProgressForm])

  // Reset state when a new drawer session starts, not on every cache refresh.
  useEffect(() => {
    if (open) {
      const initialProgressValue = goal?.currentValue ?? null
      initialProgressValueRef.current = initialProgressValue
      pendingProgressDismissRef.current = null
      setProgressValue(initialProgressValue)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    }
  }, [open, goalId])

  // Format date helper
  const formatDate = useCallback(
    (dateStr: string) => {
      return format(
        parseISO(dateStr),
        locale === 'pt-BR' ? 'dd/MM/yyyy HH:mm' : 'MMM dd, yyyy HH:mm',
        { locale: dateFnsLocale },
      )
    },
    [locale, dateFnsLocale],
  )

  // Handlers
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
    } catch (error) {
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
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal?.title, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const markAbandoned = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal?.title, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const reactivate = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal?.title, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const confirmDelete = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onOpenChange(false)
      setShowDeleteConfirm(false)
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'))
    }
  }, [deleteGoalMut, goalId, onOpenChange, showError, translate])

  const closeProgressForm = useCallback(() => {
    setProgressValue(initialProgressValueRef.current)
    setProgressNote('')
    setShowProgressForm(false)
  }, [])

  const requestProgressDismiss = useCallback((target: ProgressDismissTarget) => {
    if (isProgressDirty) {
      pendingProgressDismissRef.current = target
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
    const target = pendingProgressDismissRef.current
    pendingProgressDismissRef.current = null
    setShowProgressDiscardDialog(false)

    if (target === 'drawer') {
      onOpenChange(false)
      return
    }

    closeProgressForm()
  }, [closeProgressForm, onOpenChange])

  const cancelProgressDismiss = useCallback(() => {
    pendingProgressDismissRef.current = null
    setShowProgressDiscardDialog(false)
  }, [])

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={goal?.title ?? ''}
        canDismiss={!isProgressDirty}
        isDirty={isProgressDirty}
        onAttemptDismiss={() => requestProgressDismiss('drawer')}
      >
        {goal && (
          <div className="space-y-6">
            {/* Streak badge */}
            {isStreak && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400">
                  🔥 {t('goals.form.typeStreak')}
                </span>
              </div>
            )}

            {/* Progress section */}
            <div>
              <h4 className="form-label mb-2">
                {t('goals.progress')}
              </h4>

              {/* Progress bar */}
              <div className="h-3 bg-surface-elevated rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isStreak ? 'bg-orange-500' : 'bg-primary'}`}
                  style={{
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-text-secondary mb-4">
                {isStreak
                  ? t('goals.streak.ofTarget', {
                      current: goal.currentValue,
                      target: goal.targetValue,
                    })
                  : t('goals.progressOf', {
                      current: goal.currentValue,
                      target: goal.targetValue,
                      unit: goal.unit,
                    })}
                <span className="text-text-muted ml-1">
                  ({t('goals.progressPercentage', { pct: goal.progressPercentage })})
                </span>
              </p>

              {/* Update progress toggle */}
              {goal.status === 'Active' && !showProgressForm && (
                <button
                  className="text-sm text-primary font-semibold hover:text-primary/80 transition-colors"
                  onClick={() => {
                    initialProgressValueRef.current = goal.currentValue
                    setProgressValue(goal.currentValue)
                    setProgressNote('')
                    setShowProgressForm(true)
                  }}
                >
                  {t('goals.updateProgress')}
                </button>
              )}

              {/* Progress form */}
              {showProgressForm && goal.status === 'Active' && (
                <GoalProgressForm
                  progressValue={progressValue}
                  progressNote={progressNote}
                  isUpdating={isUpdatingProgress}
                  isStreak={isStreak}
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
            </div>

            {/* Goal Metrics */}
            {goal.status === 'Active' && (
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
                isStreak={isStreak}
              />
            )}

            {/* Linked Habits -- shown prominently for streak goals */}
            {isStreak && (goal.linkedHabits ?? []).length > 0 && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            {/* Progress history */}
            <GoalProgressHistorySection
              title={t('goals.progressHistory')}
              entries={detail?.progressHistory ?? []}
              unit={goal.unit}
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

            {/* Linked Habits (standard goals) */}
            {!isStreak && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            {/* Load error (fallback to store data) */}
            {loadError && (
              <p className="text-amber-400 text-xs">
                {t('goals.detail.loadError')}
              </p>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-border">
              {/* Status actions */}
              <div className="space-y-2">
                {goal.status === 'Active' && (
                  <GoalActionButton
                    disabled={isUpdatingStatus}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-green-400 hover:bg-green-500/10 transition-all duration-150 disabled:opacity-50"
                    onClick={markCompleted}
                    icon={<CheckCircle2 className="size-5" />}
                    label={t('goals.detail.markCompleted')}
                  />
                )}

                {goal.status === 'Active' && (
                  <GoalActionButton
                    disabled={isUpdatingStatus}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-amber-400 hover:bg-amber-500/10 transition-all duration-150 disabled:opacity-50"
                    onClick={markAbandoned}
                    icon={<ArchiveX className="size-5" />}
                    label={t('goals.detail.markAbandoned')}
                  />
                )}

                {goal.status !== 'Active' && (
                  <GoalActionButton
                    disabled={isUpdatingStatus}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-primary hover:bg-primary/10 transition-all duration-150 disabled:opacity-50"
                    onClick={reactivate}
                    icon={<RotateCw className="size-5" />}
                    label={t('goals.detail.reactivate')}
                  />
                )}
              </div>

              {/* Divider between status and data actions */}
              <div className="border-t border-border-muted my-2" />

              {/* Data actions */}
              <div className="space-y-2">
                <GoalActionButton
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-text-primary hover:bg-surface-elevated/80 transition-all duration-150"
                  onClick={() => setShowEditModal(true)}
                  icon={<PencilLine className="size-5 text-text-muted" />}
                  label={t('goals.detail.edit')}
                />

                <GoalActionButton
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-red-400 hover:bg-red-500/10 transition-all duration-150"
                  onClick={() => setShowDeleteConfirm(true)}
                  icon={<Trash2 className="size-5" />}
                  label={t('goals.detail.delete')}
                />
              </div>
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
