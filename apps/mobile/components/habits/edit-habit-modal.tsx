import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { Check } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
} from './create-habit-modal/apply-suggestion'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useUpdateHabit, useHabitDetail } from '@/hooks/use-habits'
import { useAssignTags } from '@/hooks/use-tags'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  buildHabitFormPatchFromSuggestion,
  coalesceFormText,
  extractBackendErrorCode,
  getFriendlyErrorMessage,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildUpdateHabitRequest } from '@/lib/habit-request-builders'
import { MAX_GOALS_PER_HABIT, habitFormSchema } from '@orbit/shared/validation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface EditHabitModalProps {
  open: boolean
  onClose: () => void
  habit: NormalizedHabit | null
  onSaved?: () => void | Promise<void>
}

export function EditHabitModal({
  open,
  onClose,
  habit,
  onSaved,
}: Readonly<EditHabitModalProps>) {
  const { t, i18n } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(insets.bottom), [insets.bottom])
  const updateHabit = useUpdateHabit()
  const assignTags = useAssignTags()
  const suggestion = useHabitSuggestion()
  const { showError, showSuccess, showInfo } = useAppToast()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const flushBufferedInputsRef = useRef<() => void>(() => {})
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify(
      [...tags.selectedTagIds].sort((left, right) => left.localeCompare(right)),
    ) !== initialTagIds ||
    JSON.stringify(
      [...selectedGoalIds].sort((left, right) => left.localeCompare(right)),
    ) !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: onClose,
  })

  const {
    data: habitDetail,
    isPending: detailPending,
    error: detailError,
  } = useHabitDetail(open && habit ? habit.id : null)
  const detailFieldsPending = open && !!habit && detailPending

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  const handleBufferedInputsReady = useCallback((flush: () => void) => {
    flushBufferedInputsRef.current = flush
  }, [])

  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(
          detailError,
          translate,
          'errors.fetchHabits',
          'habit',
        ),
      )
    }
  }, [detailError, showError, translate])

  const sessionHabitId = open && habit ? habit.id : null
  const sessionDetailId = habitDetail?.id ?? null
  const [previousSession, setPreviousSession] = useState<{
    habitId: string | null
    detailId: string | null
  }>({ habitId: null, detailId: null })
  if (
    sessionHabitId !== previousSession.habitId ||
    sessionDetailId !== previousSession.detailId
  ) {
    const habitChanged = sessionHabitId !== previousSession.habitId
    setPreviousSession({ habitId: sessionHabitId, detailId: sessionDetailId })
    if (open && habit && (habitChanged || !formHelpers.form.formState.isDirty)) {
      const prefill = buildEditHabitFormState(habit, habitDetail)
      formHelpers.form.reset(prefill.formValues)
      setOriginalEndDate(prefill.originalEndDate)
      setReminderTimes(prefill.reminderTimes)
      tags.resetTags(prefill.selectedTagIds)
      setSelectedGoalIds(prefill.selectedGoalIds)
      setInitialTagIds(
        JSON.stringify(
          [...prefill.selectedTagIds].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialGoalIds(
        JSON.stringify(
          [...prefill.selectedGoalIds].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
      applyHabitFormMode(prefill.mode, formHelpers)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!habit) return
    flushBufferedInputsRef.current()
    const error = formHelpers.validateAll({
      reminderTimes,
      selectedGoalIds,
      selectedTagIds: tags.selectedTagIds,
    })
    if (error) {
      showError(error)
      return
    }
    const data = habitFormSchema.parse(formHelpers.form.getValues())

    const request = buildUpdateHabitRequest(
      data,
      formHelpers.isOneTime,
      originalEndDate,
      reminderTimes,
      selectedGoalIds,
      habit.scheduledReminders.length > 0,
    )

    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request })
      await assignTags.mutateAsync({
        habitId: habit.id,
        tagIds: tags.selectedTagIds,
      })
      onClose()
      await onSaved?.()
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          'errors.updateHabit',
          'habit',
        ),
      )
    }
  }, [
    habit,
    formHelpers,
    originalEndDate,
    selectedGoalIds,
    reminderTimes,
    tags,
    updateHabit,
    assignTags,
    onClose,
    onSaved,
    showError,
    translate,
  ])

  const handleSuggest = useCallback(async () => {
    flushBufferedInputsRef.current()
    const title = coalesceFormText(formHelpers.form.getValues('title')).trim()
    if (title.length === 0) return

    try {
      const patch = buildHabitFormPatchFromSuggestion(
        await suggestion.mutateAsync({ title, language: i18n.language }),
      )

      applySuggestionSchedule(patch, formHelpers)

      const appliedChecklist = applySuggestionChecklist(patch, formHelpers.form)

      const appliedAnything =
        patch.emoji !== null ||
        patch.frequencyUnit !== null ||
        patch.days.length > 0 ||
        patch.dueTime !== null ||
        appliedChecklist
      if (appliedAnything) {
        showSuccess(t('habits.form.aiSuggestApplied'))
      } else {
        showInfo(t('habits.form.aiSuggestEmpty'))
      }
    } catch (error: unknown) {
      showError(
        extractBackendErrorCode(error) === 'PAY_GATE'
          ? t('habits.form.aiSuggestLimitReached')
          : t('habits.form.aiSuggestError'),
      )
    }
  }, [formHelpers, i18n.language, showError, showInfo, showSuccess, suggestion, t])

  const watchedTitle = coalesceFormText(
    useWatch({
      control: formHelpers.form.control,
      name: 'title',
    }),
  )
  const submitDisabled =
    updateHabit.isPending ||
    detailFieldsPending ||
    watchedTitle.trim().length === 0

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={t('habits.editHabit')}
        snapPoints={['80%', '95%']}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
        contentManagesScroll
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View
            pointerEvents={detailFieldsPending ? 'none' : 'auto'}
            style={detailFieldsPending ? styles.fieldsPending : null}
            accessibilityElementsHidden={detailFieldsPending}
          >
            <HabitFormFields
              formHelpers={formHelpers}
              tags={tags}
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={toggleGoal}
              reminderTimes={reminderTimes}
              onReminderTimesChange={setReminderTimes}
              hasScheduledReminders={(habit?.scheduledReminders.length ?? 0) > 0}
              onFlushBufferedInputsReady={handleBufferedInputsReady}
              onSuggestSetup={() => void handleSuggest()}
              isSuggesting={suggestion.isPending}
              defaultExpanded={true}
            />
          </View>
        </KeyboardAwareBottomSheetScrollView>

        <View style={styles.footer}>
          <PillButton
            variant="ghost"
            disabled={updateHabit.isPending}
            onPress={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton            disabled={submitDisabled}
            onPress={() => void handleSubmit()}
            leading={
              updateHabit.isPending ? (
                <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
              ) : (
                <Check size={18} color={tokens.fgOnPrimary} strokeWidth={2.2} />
              )
            }
          >
            {t('common.save')}
          </PillButton>
        </View>
      </BottomSheetModal>
      <ConfirmDialog
        open={dismissGuard.showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissGuard.cancelDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        onConfirm={dismissGuard.confirmDismiss}
        onCancel={dismissGuard.cancelDismiss}
        variant="warning"
      />
    </>
  )
}

function createStyles(bottomInset: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 20,
      gap: 20,
    },
    fieldsPending: {
      opacity: 0.6,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset + 12, 28),
    },
  })
}
