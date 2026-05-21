'use client'

import { useState, useCallback, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { PullQuote } from '@/components/chat/pull-quote'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalActionButton,
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
  GoalProgressForm,
} from './goal-detail-sections'
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
  const locale = useDeviceLocale()
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

  const detail = detailData?.goal ?? null
  const goal = detail ?? goalsData?.goalsById.get(goalId) ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  // Local state
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

  const [previousSession, setPreviousSession] = useState<{ open: boolean; goalId: string | null }>({
    open,
    goalId: open ? goalId : null,
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
            <div className="flex flex-col" style={{ gap: 16 }}>
              <PullQuote
                paddingX={0}
                paddingY={0}
                eyebrow={
                  <>
                    <Sparkles size={12} strokeWidth={1.7} color="var(--primary)" />
                    <span>{t('goals.detail.askAstraEyebrow')}</span>
                  </>
                }
              >
                {t('goals.detail.askAstraDefault')}
              </PullQuote>
              <div
                className="flex items-center justify-center"
                style={{ gap: 22 }}
              >
                {goal.status === 'Active' && (
                  <>
                    <GoalActionButton
                      label={t('goals.detail.markCompleted')}
                      onClick={markCompleted}
                      disabled={isUpdatingStatus}
                    />
                    <GoalActionButton
                      label={t('goals.detail.markAbandoned')}
                      onClick={markAbandoned}
                      disabled={isUpdatingStatus}
                    />
                  </>
                )}
                {goal.status !== 'Active' && (
                  <GoalActionButton
                    label={t('goals.detail.reactivate')}
                    onClick={reactivate}
                    disabled={isUpdatingStatus}
                  />
                )}
                <GoalActionButton
                  label={t('goals.detail.edit')}
                  onClick={() => setShowEditModal(true)}
                />
                <GoalActionButton
                  label={t('goals.detail.delete')}
                  destructive
                  onClick={() => setShowDeleteConfirm(true)}
                />
              </div>
            </div>
          ) : undefined
        }
      >
        {goal && (
          <div className="-mx-6">
            {/* Streak badge */}
            {isStreak && (
              <div
                style={{
                  padding: '10px 20px',
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  borderBottom: '1px solid var(--hairline)',
                }}
              >
                {t('goals.form.typeStreak')}
              </div>
            )}

            {/* Progress section */}
            <SectionLabel>{t('goals.progress')}</SectionLabel>
            <div style={{ padding: '10px 20px 16px' }}>
              <div
                className="relative rounded-full"
                style={{ height: 5, background: 'var(--bg-sunk)' }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full"
                  style={{
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                    background: 'var(--primary)',
                  }}
                />
              </div>
              <div
                className="flex items-center justify-between"
                style={{
                  marginTop: 10,
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 12,
                  color: 'var(--fg-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>
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
                  <span style={{ color: 'var(--fg-3)', marginLeft: 4 }}>
                    ({t('goals.progressPercentage', { pct: goal.progressPercentage })})
                  </span>
                </span>
                {goal.status === 'Active' && !showProgressForm && (
                  <button
                    type="button"
                    className="appearance-none border-0 bg-transparent cursor-pointer"
                    style={{
                      fontFamily: 'var(--font-family-sans)',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--fg-1)',
                      padding: 0,
                    }}
                    onClick={() => {
                      setInitialProgressValue(goal.currentValue)
                      setProgressValue(goal.currentValue)
                      setProgressNote('')
                      setShowProgressForm(true)
                    }}
                  >
                    {t('goals.updateProgress')}
                  </button>
                )}
              </div>
            </div>

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

            {/* Goal Metrics */}
            {goal.status === 'Active' && (
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
                isStreak={isStreak}
              />
            )}

            {/* Linked Habits (streak goals first) */}
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

            {loadError && (
              <p
                style={{
                  padding: '10px 20px',
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--status-overdue)',
                }}
              >
                {t('goals.detail.loadError')}
              </p>
            )}
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
