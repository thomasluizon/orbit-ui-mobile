'use client'

import { useState, useCallback, useEffect, useId, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

import { PillButton } from '@/components/ui/pill-button'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
} from './create-habit-modal/apply-suggestion'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onSaved?: () => void | Promise<void>
  relationshipFieldsLoaded?: boolean
  /**
   * The General setting this habit must match, given its position in the tree: its
   * parent's General value when it is a sub-habit, or its existing sub-habits'
   * General value when it is a parent. `null` when unconstrained. The caller (which
   * holds the full habit map) is responsible for deriving this.
   */
  lockedGeneral?: boolean | null
}

function hasEditHabitChanges(
  formDirty: boolean,
  selectedTagIds: readonly string[],
  selectedGoalIds: readonly string[],
  reminderTimes: readonly number[],
  initialTagIds: string,
  initialGoalIds: string,
  initialReminderTimes: string,
): boolean {
  const tagIds = JSON.stringify([...selectedTagIds].sort((left, right) => left.localeCompare(right)))
  const goalIds = JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right)))
  return formDirty || tagIds !== initialTagIds || goalIds !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes
}

export function EditHabitModal({
  open,
  onOpenChange,
  habit,
  onSaved,
  relationshipFieldsLoaded = true,
  lockedGeneral = null,
}: Readonly<EditHabitModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const locale = useLocale()
  const updateHabit = useUpdateHabit()
  const assignTags = useAssignTags()
  const suggestion = useHabitSuggestion()
  const { showError, showSuccess, showInfo } = useAppToast()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const formId = useId()
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')

  const watchedTitle = coalesceFormText(formHelpers.form.watch('title'))

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty = hasEditHabitChanges(
    formHelpers.form.formState.isDirty,
    tags.selectedTagIds,
    selectedGoalIds,
    reminderTimes,
    initialTagIds,
    initialGoalIds,
    initialReminderTimes,
  )
  const { sheetRef, closeSheet } = useSheetHost()
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => closeSheet(() => onOpenChange(false)),
  })

  const {
    data: habitDetail,
    isPending: detailPending,
    error: detailError,
  } = useHabitDetail(open && habit ? habit.id : null)
  const detailFieldsPending = open && !!habit && detailPending
  const childrenIsGeneral = habitDetail?.children[0]?.isGeneral ?? null
  const resolvedLockedGeneral = childrenIsGeneral ?? lockedGeneral ?? null

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(detailError, translate, 'errors.fetchHabits', 'habit'),
      )
    }
  }, [detailError, showError, translate])

  const sessionHabitId = open && habit ? habit.id : null
  const sessionDetailId = habitDetail?.id ?? null
  const previousSessionRef = useRef<{
    habitId: string | null
    detailId: string | null
  }>({ habitId: null, detailId: null })
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
    setInitialTagIds(
      JSON.stringify([...prefill.selectedTagIds].sort((left, right) => left.localeCompare(right))),
    )
    setInitialGoalIds(
      JSON.stringify([...prefill.selectedGoalIds].sort((left, right) => left.localeCompare(right))),
    )
    setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
    applyHabitFormMode(prefill.mode, formHelpers)
  }, [formHelpers, habit, habitDetail, open, sessionDetailId, sessionHabitId, tags])

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!habit) return

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

      if (!relationshipFieldsLoaded && !goalIdsChanged) delete request.goalIds
      if (!relationshipFieldsLoaded && !slipAlertChanged) delete request.slipAlertEnabled

      try {
        await updateHabit.mutateAsync({ habitId: habit.id, data: request })
        if (relationshipFieldsLoaded || tagIdsChanged) {
          await assignTags.mutateAsync({ habitId: habit.id, tagIds: tags.selectedTagIds })
        }
        closeSheet(() => onOpenChange(false))
        await onSaved?.()
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'errors.updateHabit', 'habit'))
      }
    },
    [assignTags, closeSheet, formHelpers, habit, initialGoalIds, initialTagIds, onOpenChange, onSaved, originalEndDate, relationshipFieldsLoaded, reminderTimes, selectedGoalIds, showError, tags, translate, updateHabit],
  )

  const handleSuggest = useCallback(async () => {
    const title = coalesceFormText(formHelpers.form.getValues('title')).trim()
    if (title.length === 0) return
    try {
      const patch = buildHabitFormPatchFromSuggestion(
        await suggestion.mutateAsync({ title, language: locale }),
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
  }, [formHelpers, locale, showError, showInfo, showSuccess, suggestion, t])

  function renderEditSheet() {
    if (!open) return null
    return (
      <Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? () => onOpenChange(false) : undefined}
        title={t('habits.editHabit')}
        actions={(
          <div className="flex items-center justify-end" style={{ gap: 12 }}>
            <PillButton
              variant="ghost"
              disabled={updateHabit.isPending}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              formId={formId}
              disabled={
                updateHabit.isPending ||
                detailFieldsPending ||
                watchedTitle.trim().length === 0
              }
            >
              {t('common.save')}
            </PillButton>
          </div>
        )}
      >
        <p className="mb-4 text-sm text-[var(--fg-3)]">
          {t('habits.form.editDescription')}
        </p>
        <form id={formId} onSubmit={(event) => void handleSubmit(event)}>
          <fieldset
            disabled={detailFieldsPending}
            aria-busy={detailFieldsPending || undefined}
            className={`m-0 min-w-0 border-0 p-0 transition-opacity duration-[var(--dur-base)] ${
              detailFieldsPending ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <HabitFormFields
              formHelpers={formHelpers}
              titleInputRef={titleInputRef}
              tags={tags}
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={toggleGoal}
              reminderTimes={reminderTimes}
              onReminderTimesChange={setReminderTimes}
              hasScheduledReminders={(habit?.scheduledReminders.length ?? 0) > 0}
              onSuggestSetup={() => void handleSuggest()}
              isSuggesting={suggestion.isPending}
              lockedGeneral={resolvedLockedGeneral}
              defaultExpanded
            />
          </fieldset>
        </form>
      </Sheet>
    )
  }

  return (
    <>
      {renderEditSheet()}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
