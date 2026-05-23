import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HabitFormFields } from './habit-form-fields'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useUpdateHabit, useHabitDetail } from '@/hooks/use-habits'
import { useAssignTags } from '@/hooks/use-tags'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  getFriendlyErrorMessage,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildUpdateHabitRequest } from '@/lib/habit-request-builders'
import { habitFormSchema } from '@orbit/shared/validation'
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
  const { t } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
  )
  const updateHabit = useUpdateHabit()
  const assignTags = useAssignTags()
  const { showError } = useAppToast()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const flushBufferedInputsRef = useRef<() => void>(() => {})
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')

  const atGoalLimit = selectedGoalIds.length >= 10
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

  const { data: habitDetail, error: detailError } = useHabitDetail(
    open && habit ? habit.id : null,
  )

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
    setPreviousSession({ habitId: sessionHabitId, detailId: sessionDetailId })
    if (open && habit) {
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

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={t('habits.editHabit')}
        snapPoints={['80%', '95%']}
        formMode
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <KeyboardAwareBottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <HabitFormFields
            formHelpers={formHelpers}
            tags={tags}
            selectedGoalIds={selectedGoalIds}
            atGoalLimit={atGoalLimit}
            onToggleGoal={toggleGoal}
            reminderTimes={reminderTimes}
            onReminderTimesChange={setReminderTimes}
            onFlushBufferedInputsReady={handleBufferedInputsReady}
            defaultExpanded={true}
          />

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              disabled={updateHabit.isPending}
              onPress={dismissGuard.requestDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                updateHabit.isPending && styles.disabled,
              ]}
              disabled={updateHabit.isPending}
              onPress={handleSubmit}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('habits.saveChanges')}
            >
              {updateHabit.isPending ? (
                <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
              ) : null}
              <Text style={styles.submitButtonText}>
                {t('habits.saveChanges')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareBottomSheetScrollView>
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

function createStyles(
  tokens: ReturnType<typeof createTokensV2>,
  bottomInset: number,
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 20,
      gap: 20,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 4,
    },
    cancelButton: {
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    cancelButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg3,
    },
    submitButton: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minWidth: 132,
    },
    submitButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fgOnPrimary,
    },
    disabled: {
      opacity: 0.5,
    },
  })
}
