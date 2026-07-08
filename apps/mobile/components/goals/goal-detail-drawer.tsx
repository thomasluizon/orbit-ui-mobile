import { useState, useCallback, useMemo } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { useAppToast } from '@/hooks/use-app-toast'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalAskAstraButton } from './goal-detail-drawer/goal-ask-astra-button'
import { GoalDetailCollections } from './goal-detail-drawer/goal-detail-collections'
import { GoalLoadError } from './goal-detail-drawer/goal-load-error'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import { GoalProgressForm } from './goal-detail-drawer/goal-progress-form'
import { createStyles } from './goal-detail-drawer/styles'
import { useGoalProgressFormState } from './goal-detail-drawer/use-goal-progress-form-state'
import { useGoalStatusActions } from './goal-detail-drawer/use-goal-status-actions'
import {
  formatLocaleDateTime,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { useGoals, useGoalDetail, useDeleteGoal } from '@/hooks/use-goals'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalDetailDrawerProps {
  open: boolean
  onClose: () => void
  goalId: string
}

/**
 * Goal Detail Drawer. Covers all 7 spec variants by status: on-track,
 * at-risk, behind, completed, abandoned, streak, update (active progress
 * form). Preserves: streak vs standard handling, progress mutation,
 * status mutation, delete mutation, edit modal, dismiss guard.
 */
export function GoalDetailDrawer({
  open,
  onClose,
  goalId,
}: GoalDetailDrawerProps) {
  const { t, i18n } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const insets = useSafeAreaInsets()
  const locale = i18n.language
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
  )

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
    onClose,
  })

  const { markCompleted, markAbandoned, reactivate, isUpdatingStatus } =
    useGoalStatusActions({ goalId, goalName: goal?.title, refetchDetail: () => void refetchDetail() })

  const formatDate = useCallback(
    (dateStr: string) =>
      formatLocaleDateTime(dateStr, locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [locale],
  )

  const progressText = goal
    ? isStreak
      ? t('goals.streak.ofTarget', {
          current: goal.currentValue,
          target: goal.targetValue,
        })
      : t('goals.progressOf', {
          current: goal.currentValue,
          target: goal.targetValue,
          unit: goal.unit,
        })
    : ''

  const confirmDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onClose()
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'),
      )
    }
  }, [deleteGoalMut, goalId, onClose, showError, translate])

  const router = useRouter()
  const handleAskAstra = useCallback(() => {
    if (!goal) return
    const seed = t('goals.detail.askAstraSeedDefault', { title: goal.title })
    void AsyncStorage.setItem('orbit-chat-draft', seed)
    onClose()
    router.push('/chat')
  }, [goal, onClose, router, t])

  if (!goal) return null

  const isActive = goal.status === 'Active'

  const progressFillColor = isStreak ? tokens.statusOverdue : tokens.primary
  const progressPct = Math.min(goal.progressPercentage, 100)
  const headerLine = isStreak
    ? t('goals.form.typeStreak')
    : `${t('goals.form.typeStandard')}${goal.unit ? `  ·  ${goal.unit}` : ''}`

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={goal.title}
        snapPoints={['60%', '90%']}
        canDismiss={!isProgressDirty}
        isDirty={isProgressDirty}
        onAttemptDismiss={() => requestProgressDismiss('drawer')}
        contentManagesScroll
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
        >
          <Text style={styles.headerLine}>{headerLine}</Text>

          <GoalProgressBlock
            progressPct={progressPct}
            progressFillColor={progressFillColor}
            progressText={progressText}
            progressPercentage={goal.progressPercentage}
            showEdit={isActive && !showProgressForm}
            onEdit={openProgressForm}
            styles={styles}
            tokens={tokens}
          />

          {showProgressForm && isActive ? (
            <GoalProgressForm
              isStreak={isStreak}
              progressValue={progressValue}
              onChangeValue={setProgressValue}
              progressNote={progressNote}
              onChangeNote={setProgressNote}
              progressExceedsTarget={progressExceedsTarget}
              isUpdatingProgress={isUpdatingProgress}
              onCancel={() => requestProgressDismiss('form')}
              onSubmit={() => void submitProgress()}
              styles={styles}
              tokens={tokens}
            />
          ) : null}

          {isActive ? (
            <GoalMetricsPanel
              metrics={metrics}
              unit={goal.unit}
              isLoading={isLoadingDetail}
              isStreak={isStreak}
            />
          ) : null}

          <GoalDetailCollections
            isStreak={isStreak}
            linkedHabits={goal.linkedHabits ?? []}
            entries={detail?.progressHistory ?? []}
            unit={goal.unit}
            formatDate={formatDate}
          />

          {loadError ? (
            <GoalLoadError
              onRetry={() => {
                void refetchDetail()
              }}
              styles={styles}
            />
          ) : null}

          <GoalActionFooter
            isActive={isActive}
            isUpdatingStatus={isUpdatingStatus}
            iconColor={tokens.fg3}
            dangerColor={tokens.statusBad}
            onMarkCompleted={() => void markCompleted()}
            onMarkAbandoned={() => void markAbandoned()}
            onReactivate={() => void reactivate()}
            onEdit={() => setShowEditModal(true)}
            onDelete={confirmDelete}
            styles={styles}
          />

          <GoalAskAstraButton
            tokens={tokens}
            styles={styles}
            onPress={handleAskAstra}
          />
        </KeyboardAwareBottomSheetScrollView>
      </BottomSheetModal>

      {goal ? (
        <EditGoalModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          goal={goal}
        />
      ) : null}

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
        onConfirm={() => void handleDeleteConfirm()}
      />
    </>
  )
}
