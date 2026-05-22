import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { useAppToast } from '@/hooks/use-app-toast'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from './goal-detail-sections'
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalDetailDrawerProps {
  open: boolean
  onClose: () => void
  goalId: string
}

type ProgressDismissTarget = 'drawer' | 'form'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * v8 Goal Detail Drawer. Covers all 7 spec variants by status: on-track,
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

  if (!goal) return null

  const isCompleted = goal.status === 'Completed'
  const isAbandoned = goal.status === 'Abandoned'
  const isActive = goal.status === 'Active'

  const statusLabel = isCompleted
    ? t('goals.status.completed')
    : isAbandoned
      ? t('goals.status.abandoned')
      : t('goals.status.active')
  const statusColor = isCompleted
    ? tokens.primary
    : isAbandoned
      ? tokens.fg3
      : tokens.statusDone

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
        formMode={showProgressForm}
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

          <View>
            <SectionLabel top={4} bottom={8}>
              {t('goals.progress')}
            </SectionLabel>
            <View style={styles.progressBlock}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: tokens.bgSunk },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: progressFillColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  {progressText}
                  {'  '}
                  <Text style={styles.progressPercent}>
                    ({t('goals.progressPercentage', { pct: goal.progressPercentage })})
                  </Text>
                </Text>
                {isActive && !showProgressForm ? (
                  <TouchableOpacity
                    onPress={() => {
                      const nextInitial =
                        goal.currentValue !== undefined
                          ? String(goal.currentValue)
                          : ''
                      setInitialProgressValue(nextInitial)
                      setProgressValue(nextInitial)
                      setProgressNote('')
                      setShowProgressForm(true)
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('goals.updateProgress')}
                  >
                    <Text style={styles.linkAction}>
                      {t('goals.updateProgress')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {showProgressForm && isActive ? (
            <View style={styles.progressForm}>
              <View>
                <Text style={styles.formLabel}>
                  {isStreak
                    ? t('goals.form.streakTarget')
                    : t('goals.form.targetValue')}
                </Text>
                <BottomSheetAppTextInput
                  style={styles.formInput}
                  value={progressValue}
                  onChangeText={setProgressValue}
                  keyboardType="decimal-pad"
                  accessibilityLabel={
                    isStreak
                      ? t('goals.form.streakTarget')
                      : t('goals.form.targetValue')
                  }
                  accessibilityHint={t('goals.updateProgress')}
                />
                {progressExceedsTarget ? (
                  <Text style={styles.warningText}>
                    {t('goals.form.progressExceedsTarget')}
                  </Text>
                ) : null}
              </View>
              <View>
                <Text style={styles.formLabel}>{t('goals.progressNote')}</Text>
                <BottomSheetAppTextInput
                  style={styles.formInput}
                  value={progressNote}
                  onChangeText={setProgressNote}
                  placeholder={t('goals.progressNote')}
                  placeholderTextColor={tokens.fg4}
                  accessibilityLabel={t('goals.progressNote')}
                  accessibilityHint={t('goals.updateProgress')}
                />
              </View>
              <View style={styles.progressFormActions}>
                <TouchableOpacity
                  onPress={() => requestProgressDismiss('form')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  accessibilityHint={t('common.discardChangesDescription')}
                  style={styles.formCancelBtn}
                >
                  <Text style={styles.formCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitProgress}
                  disabled={!progressValue || isUpdatingProgress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.save')}
                  style={[
                    styles.formSaveBtn,
                    (!progressValue || isUpdatingProgress) && styles.disabled,
                  ]}
                >
                  {isUpdatingProgress ? (
                    <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
                  ) : (
                    <Text style={styles.formSaveText}>{t('common.save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {isActive ? (
            <View>
              <SectionLabel top={8} bottom={0}>
                {t('goals.metrics.title')}
              </SectionLabel>
              <SettingsRow
                label={t('goals.detail.statusLabel')}
                accessory="none"
                leadingDot={statusColor}
                value={statusLabel}
              />
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
                isStreak={isStreak}
              />
            </View>
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

          <View style={styles.askAstra}>
            <View
              style={[
                styles.askAstraRule,
                { backgroundColor: tokens.primary },
              ]}
            />
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

          <View style={styles.actionsRow}>
            {isActive ? (
              <>
                <TouchableOpacity
                  onPress={markCompleted}
                  disabled={isUpdatingStatus}
                  activeOpacity={0.7}
                  style={styles.actionLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('goals.detail.markCompleted')}
                >
                  <Text style={styles.actionLinkText}>
                    {t('goals.detail.markCompleted')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={markAbandoned}
                  disabled={isUpdatingStatus}
                  activeOpacity={0.7}
                  style={styles.actionLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('goals.detail.markAbandoned')}
                >
                  <Text style={styles.actionLinkTextMuted}>
                    {t('goals.detail.markAbandoned')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={reactivate}
                disabled={isUpdatingStatus}
                activeOpacity={0.7}
                style={styles.actionLink}
                accessibilityRole="button"
                accessibilityLabel={t('goals.detail.reactivate')}
              >
                <Text style={styles.actionLinkText}>
                  {t('goals.detail.reactivate')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowEditModal(true)}
              activeOpacity={0.7}
              style={styles.actionLink}
              accessibilityRole="button"
              accessibilityLabel={t('goals.detail.edit')}
            >
              <Text style={styles.actionLinkTextMuted}>
                {t('goals.detail.edit')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmDelete}
              activeOpacity={0.7}
              style={styles.actionLink}
              accessibilityRole="button"
              accessibilityLabel={t('goals.detail.delete')}
            >
              <Text style={styles.actionLinkTextDelete}>
                {t('goals.detail.delete')}
              </Text>
            </TouchableOpacity>
          </View>
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  tokens: ReturnType<typeof createTokensV2>,
  bottomInset: number,
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Math.max(bottomInset, 16) + 24,
    },
    headerLine: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 14,
      fontFamily: 'GeistMono',
      fontSize: 12,
      fontWeight: '500',
      color: tokens.fg3,
      letterSpacing: 0.48,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    progressBlock: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    progressTrack: {
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    progressText: {
      fontFamily: 'GeistMono',
      fontSize: 12,
      color: tokens.fg2,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    progressPercent: {
      color: tokens.fg3,
    },
    linkAction: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '500',
      color: tokens.fg1,
    },
    progressForm: {
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 12,
      backgroundColor: tokens.bgElev,
      borderRadius: 10,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
    },
    formLabel: {
      fontFamily: 'Geist',
      fontSize: 11,
      fontWeight: '600',
      color: tokens.fg3,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    formInput: {
      backgroundColor: tokens.bg,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: tokens.fg1,
      fontFamily: 'Geist',
    },
    progressFormActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 14,
      paddingTop: 4,
    },
    formCancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    formCancelText: {
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg3,
    },
    formSaveBtn: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formSaveText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fgOnPrimary,
    },
    disabled: {
      opacity: 0.5,
    },
    warningText: {
      paddingHorizontal: 20,
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
    },
    askAstra: {
      position: 'relative',
      paddingLeft: 34,
      paddingRight: 20,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    askAstraRule: {
      position: 'absolute',
      left: 20,
      top: 20,
      bottom: 20,
      width: 2,
      borderRadius: 1,
    },
    askAstraEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    askAstraEyebrowText: {
      fontFamily: 'GeistMono',
      fontSize: 10.5,
      fontWeight: '500',
      letterSpacing: 0.63,
      color: tokens.fg3,
    },
    askAstraBody: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      lineHeight: 20,
      color: tokens.fg2,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 22,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
    },
    actionLink: {
      paddingVertical: 4,
    },
    actionLinkText: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '500',
      color: tokens.fg1,
    },
    actionLinkTextMuted: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
    },
    actionLinkTextDelete: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.fg3,
    },
  })
}
