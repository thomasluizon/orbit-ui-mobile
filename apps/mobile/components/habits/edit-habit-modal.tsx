import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'

import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
} from './create-habit-modal/apply-suggestion'
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

interface EditHabitModalProps {
  open: boolean
  onClose: () => void
  habit: NormalizedHabit | null
  onSaved?: () => void | Promise<void>
  /** The habit's parent's `isGeneral`, when it has a parent, from the caller's loaded habit map. */
  parentIsGeneral?: boolean | null
}

function hasEditHabitChanges({
  formDirty,
  selectedTagIds,
  selectedGoalIds,
  reminderTimes,
  initialTagIds,
  initialGoalIds,
  initialReminderTimes,
}: Readonly<{
  formDirty: boolean
  selectedTagIds: string[]
  selectedGoalIds: string[]
  reminderTimes: number[]
  initialTagIds: string
  initialGoalIds: string
  initialReminderTimes: string
}>): boolean {
  const tagSnapshot = JSON.stringify([...selectedTagIds].sort((a, b) => a.localeCompare(b)))
  const goalSnapshot = JSON.stringify([...selectedGoalIds].sort((a, b) => a.localeCompare(b)))
  return formDirty || tagSnapshot !== initialTagIds || goalSnapshot !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes
}

export function EditHabitModal({
  open,
  onClose,
  habit,
  onSaved,
  parentIsGeneral = null,
}: Readonly<EditHabitModalProps>) {
  const { t, i18n } = useTranslation()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  )
  const insets = useSafeAreaInsets()
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
  const previousSessionRef = useRef<{
    habitId: string | null
    detailId: string | null
  }>({ habitId: null, detailId: null })

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty = hasEditHabitChanges({
    formDirty: formHelpers.form.formState.isDirty,
    selectedTagIds: tags.selectedTagIds,
    selectedGoalIds,
    reminderTimes,
    initialTagIds,
    initialGoalIds,
    initialReminderTimes,
  })
  const { sheetRef, closeSheet } = useSheetHost()
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => closeSheet(onClose),
  })
  const router = useRouter()
  const navigateToUpgrade = useCallback(() => {
    closeSheet(() => {
      onClose()
      router.push('/upgrade')
    })
  }, [closeSheet, onClose, router])

  const {
    data: habitDetail,
    isPending: detailPending,
    error: detailError,
  } = useHabitDetail(open && habit ? habit.id : null)
  const detailFieldsPending = open && !!habit && detailPending
  const childrenIsGeneral = habitDetail?.children[0]?.isGeneral ?? null
  const lockedGeneral = childrenIsGeneral ?? parentIsGeneral ?? null

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
  useEffect(() => {
    const previousSession = previousSessionRef.current
    if (
      sessionHabitId === previousSession.habitId &&
      sessionDetailId === previousSession.detailId
    ) return

    const habitChanged = sessionHabitId !== previousSession.habitId
    previousSessionRef.current = { habitId: sessionHabitId, detailId: sessionDetailId }
    if (!open || !habit || (!habitChanged && formHelpers.form.formState.isDirty)) return

    const prefill = buildEditHabitFormState(habit, habitDetail)
    formHelpers.form.reset(prefill.formValues)
    setOriginalEndDate(prefill.originalEndDate)
    setReminderTimes(prefill.reminderTimes)
    tags.resetTags(prefill.selectedTagIds)
    setSelectedGoalIds(prefill.selectedGoalIds)
    setInitialTagIds(JSON.stringify([...prefill.selectedTagIds].sort((a, b) => a.localeCompare(b))))
    setInitialGoalIds(JSON.stringify([...prefill.selectedGoalIds].sort((a, b) => a.localeCompare(b))))
    setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
    applyHabitFormMode(prefill.mode, formHelpers)
  }, [formHelpers, habit, habitDetail, open, sessionDetailId, sessionHabitId, tags])

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
      closeSheet(onClose)
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
    closeSheet,
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
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? onClose : undefined}
        title={t('habits.editHabit')}
      >
        <View style={styles.scrollContent}>
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
              lockedGeneral={lockedGeneral}
              onUpgrade={navigateToUpgrade}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <PillButton
            variant="ghost"
            disabled={updateHabit.isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton

            disabled={submitDisabled}
            onClick={() => void handleSubmit()}

          >
            {t('common.save')}
          </PillButton>
        </View>
      </Sheet>) : null}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
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
