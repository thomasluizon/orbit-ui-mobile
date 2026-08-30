import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
  relationshipFieldsLoaded?: boolean
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
  relationshipFieldsLoaded = true,
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
  const relationshipFieldsTouchedRef = useRef({
    goalIds: false,
    tagIds: false,
    slipAlertEnabled: false,
  })
  const trackedTags = useMemo(() => ({
    ...tags,
    toggleTag: (tagId: string) => {
      relationshipFieldsTouchedRef.current.tagIds = true
      tags.toggleTag(tagId)
    },
    createAndSelectTag: async (...args: Parameters<typeof tags.createAndSelectTag>) => {
      relationshipFieldsTouchedRef.current.tagIds = true
      await tags.createAndSelectTag(...args)
    },
    acceptSuggestedTag: async (...args: Parameters<typeof tags.acceptSuggestedTag>) => {
      relationshipFieldsTouchedRef.current.tagIds = true
      await tags.acceptSuggestedTag(...args)
    },
    deleteTag: async (...args: Parameters<typeof tags.deleteTag>) => {
      relationshipFieldsTouchedRef.current.tagIds = true
      await tags.deleteTag(...args)
    },
  }), [tags])
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const flushBufferedInputsRef = useRef<() => void>(() => {})
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')
  const relationshipFieldsHydratedRef = useRef(false)
  const relationshipSessionHabitIdRef = useRef<string | null>(null)
  const previousRelationshipFieldsLoadedRef = useRef(relationshipFieldsLoaded)
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
    relationshipFieldsTouchedRef.current.goalIds = true
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  const handleSlipAlertEnabledChange = useCallback((nextEnabled: boolean) => {
    relationshipFieldsTouchedRef.current.slipAlertEnabled = true
    formHelpers.form.setValue('slipAlertEnabled', nextEnabled, { shouldDirty: true })
  }, [formHelpers.form])

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
  useLayoutEffect(() => {
    if (sessionHabitId !== relationshipSessionHabitIdRef.current) {
      relationshipSessionHabitIdRef.current = sessionHabitId
      previousRelationshipFieldsLoadedRef.current = relationshipFieldsLoaded
      relationshipFieldsTouchedRef.current = {
        goalIds: false,
        tagIds: false,
        slipAlertEnabled: false,
      }
      return
    }

    const relationshipAuthorityArrived =
      !previousRelationshipFieldsLoadedRef.current && relationshipFieldsLoaded
    previousRelationshipFieldsLoadedRef.current = relationshipFieldsLoaded
    if (!relationshipAuthorityArrived || !open || !habit) return

    const prefill = buildEditHabitFormState(habit, habitDetail)
    const touched = relationshipFieldsTouchedRef.current
    if (!touched.tagIds) {
      tags.resetTags(prefill.selectedTagIds)
      setInitialTagIds(JSON.stringify([...prefill.selectedTagIds].sort((a, b) => a.localeCompare(b))))
    }
    if (!touched.goalIds) {
      setSelectedGoalIds(prefill.selectedGoalIds)
      setInitialGoalIds(JSON.stringify([...prefill.selectedGoalIds].sort((a, b) => a.localeCompare(b))))
    }
    if (!touched.slipAlertEnabled) {
      formHelpers.form.resetField('slipAlertEnabled', {
        defaultValue: prefill.formValues.slipAlertEnabled,
      })
    }
    relationshipFieldsHydratedRef.current = true
  }, [formHelpers.form, habit, habitDetail, open, relationshipFieldsLoaded, sessionHabitId, tags])

  useEffect(() => {
    const previousSession = previousSessionRef.current
    if (
      sessionHabitId === previousSession.habitId &&
      sessionDetailId === previousSession.detailId
    ) return

    const habitChanged = sessionHabitId !== previousSession.habitId
    previousSessionRef.current = { habitId: sessionHabitId, detailId: sessionDetailId }
    if (!open || !habit) return
    if (!habitChanged && formHelpers.form.formState.isDirty) return

    const prefill = buildEditHabitFormState(habit, habitDetail)
    const touched = relationshipFieldsTouchedRef.current
    const formValues = touched.slipAlertEnabled
      ? {
          ...prefill.formValues,
          slipAlertEnabled: formHelpers.form.getValues('slipAlertEnabled'),
        }
      : prefill.formValues
    formHelpers.form.reset(formValues)
    setOriginalEndDate(prefill.originalEndDate)
    setReminderTimes(prefill.reminderTimes)
    if (!touched.tagIds) {
      tags.resetTags(prefill.selectedTagIds)
      setInitialTagIds(JSON.stringify([...prefill.selectedTagIds].sort((a, b) => a.localeCompare(b))))
    }
    if (!touched.goalIds) {
      setSelectedGoalIds(prefill.selectedGoalIds)
      setInitialGoalIds(JSON.stringify([...prefill.selectedGoalIds].sort((a, b) => a.localeCompare(b))))
    }
    setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
    relationshipFieldsHydratedRef.current = relationshipFieldsLoaded
    applyHabitFormMode(prefill.mode, formHelpers)
  }, [formHelpers, habit, habitDetail, open, relationshipFieldsLoaded, sessionDetailId, sessionHabitId, tags])

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
    const goalIdsChanged = JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialGoalIds
    const tagIdsChanged = JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialTagIds
    const slipAlertChanged = !!formHelpers.form.formState.dirtyFields.slipAlertEnabled

    if (!relationshipFieldsHydratedRef.current && !goalIdsChanged) delete request.goalIds
    if (!relationshipFieldsHydratedRef.current && !slipAlertChanged) delete request.slipAlertEnabled

    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request })
      if (relationshipFieldsHydratedRef.current || tagIdsChanged) {
        await assignTags.mutateAsync({
          habitId: habit.id,
          tagIds: tags.selectedTagIds,
        })
      }
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
    initialGoalIds,
    initialTagIds,
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
        onAttemptDismiss={dismissGuard.requestDismiss}
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
              tags={trackedTags}
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={toggleGoal}
              reminderTimes={reminderTimes}
              onReminderTimesChange={setReminderTimes}
              onSlipAlertEnabledChange={handleSlipAlertEnabledChange}
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
