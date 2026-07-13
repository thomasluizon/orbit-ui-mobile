'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditGoalModal } from './edit-goal-modal'
import { GoalAskAstraRow } from './goal-ask-astra-row'
import { GoalMetricsPanel } from './goal-metrics-panel'
import { GoalProgressForm } from './goal-detail-sections'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalDetailCollections } from './goal-detail-drawer/goal-detail-collections'
import { GoalLoadError } from './goal-detail-drawer/goal-load-error'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import {
  useGoalDrawerInitialAction,
  type GoalDrawerInitialAction,
} from './goal-detail-drawer/use-goal-drawer-initial-action'
import { useGoalProgressFormState } from './goal-detail-drawer/use-goal-progress-form-state'
import { useGoalStatusActions } from './goal-detail-drawer/use-goal-status-actions'
import {
  formatLocaleDateTime,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoals, useGoalDetail, useDeleteGoal } from '@/hooks/use-goals'

export type { GoalDrawerInitialAction } from './goal-detail-drawer/use-goal-drawer-initial-action'

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
  const deleteGoalMut = useDeleteGoal()

  const detail = detailData?.goal ?? null
  const goal = detail ?? goalsData?.goalsById.get(goalId) ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const {
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
  } = useGoalProgressFormState({
    open,
    goalId,
    goalCurrentValue: goal?.currentValue,
    goalTargetValue: goal?.targetValue,
    refetchDetail,
    onOpenChange,
  })

  const { markCompleted, markAbandoned, reactivate, isUpdatingStatus } =
    useGoalStatusActions({ goalId, goalName: goal?.title, refetchDetail })

  const confirmDelete = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onOpenChange(false)
      setShowDeleteConfirm(false)
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'))
    }
  }, [deleteGoalMut, goalId, onOpenChange, showError, translate])

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

  useGoalDrawerInitialAction({
    open,
    initialAction,
    openEditModal: () => setShowEditModal(true),
    openDeleteConfirm: () => setShowDeleteConfirm(true),
    openProgressForm,
    markCompleted,
  })

  let progressText = ''
  if (goal) {
    progressText = isStreak
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

  const unitSuffix = goal?.unit ? `  ·  ${goal.unit}` : ''

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
                : `${t('goals.form.typeStandard')}${unitSuffix}`}
            </div>

            <GoalProgressBlock
              progressPercentage={goal.progressPercentage}
              progressFillColor={isStreak ? 'var(--status-overdue)' : 'var(--primary)'}
              progressText={progressText}
              showEdit={goal.status === 'Active' && !showProgressForm}
              onEdit={openProgressForm}
            />

            {showProgressForm && goal.status === 'Active' && (
              <GoalProgressForm
                progressValue={progressValue}
                progressNote={progressNote}
                isUpdating={isUpdatingProgress}
                progressExceedsTarget={progressExceedsTarget}
                onProgressValueChange={setProgressValue}
                onProgressNoteChange={setProgressNote}
                onSubmit={() => void submitProgress()}
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

            <GoalDetailCollections
              isStreak={isStreak}
              linkedHabits={goal.linkedHabits}
              entries={detail?.progressHistory ?? []}
              unit={goal.unit}
              formatDate={formatDate}
            />

            {loadError && <GoalLoadError onRetry={() => void refetchDetail()} />}

            <GoalActionFooter
              isActive={goal.status === 'Active'}
              isUpdatingStatus={isUpdatingStatus}
              onMarkCompleted={() => void markCompleted()}
              onMarkAbandoned={() => void markAbandoned()}
              onReactivate={() => void reactivate()}
              onEdit={() => setShowEditModal(true)}
              onDelete={() => setShowDeleteConfirm(true)}
            />
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
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}
