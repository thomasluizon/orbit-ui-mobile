import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  Flame,
  PencilLine,
  CheckCircle2,
  ArchiveX,
  RotateCw,
  Trash2,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { useAppToast } from '@/hooks/use-app-toast'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalActionButton,
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
} from './goal-detail-sections'
import {
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
import { radius } from '@/lib/theme'
import type { ThemeContextValue } from '@/lib/theme-provider'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalDetailDrawerProps {
  open: boolean
  onClose: () => void
  goalId: string
}

type AppColors = ThemeContextValue['colors']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const { colors } = useAppTheme()
  const { showInterstitialIfDue } = useAdMob()
  const insets = useSafeAreaInsets()
  const locale = i18n.language
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom])

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
  const [progressValue, setProgressValue] = useState('')
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    const numVal = Number(progressValue)
    if (!progressValue || isNaN(numVal) || !goal) return false
    return numVal > goal.targetValue
  }, [progressValue, goal])

  // Reset state when a new drawer session starts, not on every cache refresh.
  useEffect(() => {
    if (open) {
      setProgressValue(
        goal?.currentValue !== undefined ? String(goal.currentValue) : '',
      )
      setShowProgressForm(false)
      setProgressNote('')
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

  // Progress text: streak goals use "Day X of Y", standard use "X of Y unit"
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
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.progress', 'goalProgress'))
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

  const confirmDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onClose()
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'))
    }
  }, [deleteGoalMut, goalId, onClose, showError, translate])

  if (!goal) return null

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={goal.title}
        snapPoints={['60%', '90%']}
        formMode={showProgressForm}
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
        >
          {/* Streak type badge near title */}
          {isStreak && (
            <View style={styles.streakBadgeRow}>
              <View style={styles.streakBadge}>
                <Flame size={12} color={colors.amber400} />
                <Text style={styles.streakBadgeText}>
                  {t('goals.form.typeStreak')}
                </Text>
              </View>
            </View>
          )}

          {/* Progress section */}
          <View>
            <Text style={styles.sectionTitle}>{t('goals.progress')}</Text>

            {/* Progress bar */}
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                    backgroundColor: isStreak ? colors.amber500 : colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progressText}
              {'  '}
              <Text style={styles.progressPercent}>
                ({t('goals.progressPercentage', { pct: goal.progressPercentage })})
              </Text>
            </Text>

            {/* Update progress toggle */}
            {goal.status === 'Active' && !showProgressForm && (
              <TouchableOpacity
                onPress={() => {
                  setProgressValue(
                    goal.currentValue !== undefined ? String(goal.currentValue) : '',
                  )
                  setProgressNote('')
                  setShowProgressForm(true)
                }}
                activeOpacity={0.7}
                style={styles.updateProgressLink}
              >
                <Text style={styles.updateProgressLinkText}>
                  {t('goals.updateProgress')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Progress form */}
            {showProgressForm && goal.status === 'Active' && (
              <View style={styles.progressForm}>
                <View>
                  <Text style={styles.formLabel}>
                    {isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
                  </Text>
                  <BottomSheetAppTextInput
                    style={styles.formInput}
                    value={progressValue}
                    onChangeText={setProgressValue}
                    keyboardType="decimal-pad"
                  />
                  {progressExceedsTarget && (
                    <Text style={styles.warningText}>
                      {t('goals.form.progressExceedsTarget')}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.formLabel}>
                    {t('goals.progressNote')}
                  </Text>
                  <BottomSheetAppTextInput
                    style={styles.formInput}
                    value={progressNote}
                    onChangeText={setProgressNote}
                    placeholder={t('goals.progressNote')}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.progressFormActions}>
                  <TouchableOpacity
                    style={[
                      styles.progressSaveButton,
                      (!progressValue || isUpdatingProgress) &&
                        styles.buttonDisabled,
                    ]}
                    onPress={submitProgress}
                    disabled={!progressValue || isUpdatingProgress}
                    activeOpacity={0.8}
                  >
                    {isUpdatingProgress ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.progressSaveText}>
                        {t('common.save')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.progressCancelButton}
                    onPress={() => setShowProgressForm(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.progressCancelText}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

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
              styles={styles}
            />
          )}

          {/* Progress history */}
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
            primaryColor={colors.primary}
            styles={styles}
          />

          {/* Linked Habits (standard goals) */}
          {!isStreak && (
            <GoalLinkedHabitsSection
              title={t('goals.linkedHabits')}
              linkedHabits={goal.linkedHabits ?? []}
              styles={styles}
            />
          )}

          {/* Load error (fallback to store data) */}
          {loadError && (
            <Text style={styles.warningText}>
              {t('goals.detail.loadError')}
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actionsSection}>
            {/* Status actions */}
            {goal.status === 'Active' && (
              <GoalActionButton
                styles={styles}
                onPress={markCompleted}
                disabled={isUpdatingStatus}
                icon={<CheckCircle2 size={20} color={colors.green400} />}
                color={colors.green400}
                label={t('goals.detail.markCompleted')}
              />
            )}

            {goal.status === 'Active' && (
              <GoalActionButton
                styles={styles}
                onPress={markAbandoned}
                disabled={isUpdatingStatus}
                icon={<ArchiveX size={20} color={colors.amber400} />}
                color={colors.amber400}
                label={t('goals.detail.markAbandoned')}
              />
            )}

            {goal.status !== 'Active' && (
              <GoalActionButton
                styles={styles}
                onPress={reactivate}
                disabled={isUpdatingStatus}
                icon={<RotateCw size={20} color={colors.primary} />}
                color={colors.primary}
                label={t('goals.detail.reactivate')}
              />
            )}

            {/* Separator between status and data actions */}
            <View style={styles.actionsDivider} />

            {/* Data actions */}
            <GoalActionButton
              styles={styles}
              onPress={() => setShowEditModal(true)}
              icon={<PencilLine size={20} color={colors.textMuted} />}
              color={colors.textPrimary}
              label={t('goals.detail.edit')}
            />

            <GoalActionButton
              styles={styles}
              onPress={confirmDelete}
              icon={<Trash2 size={20} color={colors.red400} />}
              color={colors.red400}
              label={t('goals.detail.delete')}
            />
          </View>
        </KeyboardAwareBottomSheetScrollView>
      </BottomSheetModal>

      {goal && (
        <EditGoalModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          goal={goal}
        />
      )}

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

function createStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Math.max(bottomInset, 16) + 24,
    gap: 24,
  },

  // Streak badge
  streakBadgeRow: {
    flexDirection: 'row',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  streakBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.amber400,
  },

  // Section titles
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Progress
  progressBar: {
    height: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 9999,
  },
  progressText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  progressPercent: {
    color: colors.textMuted,
  },
  updateProgressLink: {
    paddingVertical: 4,
  },
  updateProgressLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Progress form
  progressForm: {
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  progressFormActions: {
    flexDirection: 'row',
    gap: 8,
  },
  progressSaveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  progressCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Progress history
  historyList: {
    gap: 8,
    maxHeight: 192,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyEntryLeft: {
    flex: 1,
    minWidth: 0,
  },
  historyEntryValue: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  historyEntryNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyEntryDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 8,
    flexShrink: 0,
  },

  // Linked habits
  linkedHabitsSection: {
    gap: 12,
  },
  linkedHabitsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkedHabitChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkedHabitText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // Warnings / errors
  warningText: {
    fontSize: 12,
    color: colors.amber400,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: colors.red400,
  },

  // Actions
  actionsSection: {
    gap: 4,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionsDivider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 0,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  actionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  })
}
