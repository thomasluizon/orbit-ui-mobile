import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppToast } from '@/hooks/use-app-toast'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from './goal-detail-sections'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import { GoalProgressForm } from './goal-detail-drawer/goal-progress-form'
import { createStyles } from './goal-detail-drawer/styles'
import {
  formatLocaleDateTime,
  getFriendlyErrorMessage,
  translateErrorKey,
  validateGoalProgressInput,
} from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import {
  useGoals,
  useGoalDetail,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
  useDeleteGoal,
} from '@/hooks/use-goals'
import { useAdMob } from '@/hooks/use-ad-mob'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalDetailDrawerProps {
  open: boolean
  onClose: () => void
  goalId: string
}

type ProgressDismissTarget = 'drawer' | 'form'

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
  const { showInterstitialIfDue } = useAdMob()
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

  const updateProgress = useUpdateGoalProgress()
  const updateStatus = useUpdateGoalStatus()
  const deleteGoalMut = useDeleteGoal()

  const detail = detailData?.goal ?? null
  const goal = detail ?? goalsData?.goalsById.get(goalId) ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [progressValue, setProgressValue] = useState('')
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] =
    useState(false)
  const pendingProgressDismissRef = useRef<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    const numVal = Number(progressValue)
    if (!progressValue || isNaN(numVal) || !goal) return false
    return numVal > goal.targetValue
  }, [progressValue, goal])

  const [initialProgressValue, setInitialProgressValue] = useState('')

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false
    return (
      progressValue !== initialProgressValue || progressNote.trim().length > 0
    )
  }, [initialProgressValue, progressNote, progressValue, showProgressForm])

  useEffect(() => {
    if (open) {
      const nextInitial =
        goal?.currentValue !== undefined ? String(goal.currentValue) : ''
      pendingProgressDismissRef.current = null
       
      setInitialProgressValue(nextInitial)
      setProgressValue(nextInitial)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    }
  }, [open, goalId, goal?.currentValue])

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
    if (!progressValue || isNaN(numVal)) return
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
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'),
      )
    }
  }, [
    goalId,
    goal,
    isUpdatingStatus,
    refetchDetail,
    showError,
    translate,
    updateStatus,
  ])

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
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'),
      )
    }
  }, [
    goalId,
    goal,
    isUpdatingStatus,
    refetchDetail,
    showError,
    translate,
    updateStatus,
  ])

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
      showError(
        getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'),
      )
    }
  }, [
    goalId,
    goal,
    isUpdatingStatus,
    refetchDetail,
    showError,
    translate,
    updateStatus,
  ])

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

  const closeProgressForm = useCallback(() => {
    setProgressValue(initialProgressValue)
    setProgressNote('')
    setShowProgressForm(false)
  }, [initialProgressValue])

  const openProgressForm = useCallback(() => {
    const nextInitial =
      goal?.currentValue !== undefined ? String(goal.currentValue) : ''
    setInitialProgressValue(nextInitial)
    setProgressValue(nextInitial)
    setProgressNote('')
    setShowProgressForm(true)
  }, [goal?.currentValue])

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

  const router = useRouter()
  const handleAskAstra = useCallback(() => {
    if (!goal) return
    const seed = `${t('goals.detail.askAstraDefault')} (${goal.title})`
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
              onSubmit={submitProgress}
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

          {(goal.linkedHabits ?? []).length > 0 ? (
            <View>
              <SectionLabel top={8} bottom={0}>
                {t('goals.linkedHabits')}
              </SectionLabel>
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            </View>
          ) : null}

          {(detail?.progressHistory ?? []).length > 0 ? (
            <View>
              <SectionLabel top={8} bottom={0}>
                {t('goals.progressHistory')}
              </SectionLabel>
              <GoalProgressHistorySection
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
            </View>
          ) : null}

          {loadError ? (
            <Text style={styles.warningText}>{t('goals.detail.loadError')}</Text>
          ) : null}

          <GoalActionFooter
            isActive={isActive}
            isUpdatingStatus={isUpdatingStatus}
            iconColor={tokens.fg3}
            onMarkCompleted={markCompleted}
            onMarkAbandoned={markAbandoned}
            onReactivate={reactivate}
            onEdit={() => setShowEditModal(true)}
            onDelete={confirmDelete}
            styles={styles}
          />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleAskAstra}
            accessibilityRole="button"
            accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`}
            style={styles.askAstra}
          >
            <View
              style={[
                styles.askAstraRule,
                { backgroundColor: tokens.primary },
              ]}
            />
            <View style={styles.askAstraContent}>
              <View style={styles.askAstraEyebrow}>
                <Sparkles size={12} color={tokens.primary} strokeWidth={1.7} />
                <Text style={styles.askAstraEyebrowText}>
                  {t('goals.detail.askAstraEyebrow')}
                </Text>
              </View>
              <Text style={styles.askAstraBody}>
                {t('goals.detail.askAstraDefault')}
              </Text>
            </View>
            <ChevronRight size={16} color={tokens.fg3} strokeWidth={1.7} />
          </TouchableOpacity>
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
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
