'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HabitFormFields } from './habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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
import { buildUpdateHabitRequest, type HabitFormData } from '@/lib/habit-request-builders'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onSaved?: () => void | Promise<void>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditHabitModal({
  open,
  onOpenChange,
  habit,
  onSaved,
}: Readonly<EditHabitModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const updateHabit = useUpdateHabit()
  const assignTags = useAssignTags()
  const { showError } = useAppToast()

  const formHelpers = useHabitForm()
  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')

  const atGoalLimit = selectedGoalIds.length >= 10
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialTagIds ||
    JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
  })

  // Fetch detail to get dueDate, dueTime, endDate etc.
  const { data: habitDetail, error: detailError } = useHabitDetail(open && habit ? habit.id : null)

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  // Show detail fetch error
  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(detailError, translate, 'errors.fetchHabits', 'habit'),
      )
    }
  }, [detailError, showError, translate])

  // Populate form when the modal session starts and once detail loads.
  // Avoid rehydrating on every background refetch while the user is typing.
  // setState-in-effect is acceptable here: we are mirroring server-fetched
  // habit detail into local form fields on session start.
  useEffect(() => {
    if (!open || !habit) return

    const prefill = buildEditHabitFormState(habit, habitDetail)
    formHelpers.form.reset(prefill.formValues)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server-fetched detail into local form state on session start
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit?.id, habitDetail?.id])

  const handleSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
      e.preventDefault()
      if (!habit) return

      const data = formHelpers.form.getValues() as unknown as HabitFormData
      const error = formHelpers.validateAll({
        reminderTimes,
        selectedGoalIds,
        selectedTagIds: tags.selectedTagIds,
      })
      if (error) {
        showError(error)
        return
      }

      const request = buildUpdateHabitRequest(data, formHelpers.isOneTime, originalEndDate, reminderTimes, selectedGoalIds)

      try {
        await updateHabit.mutateAsync({ habitId: habit.id, data: request })
        await assignTags.mutateAsync({ habitId: habit.id, tagIds: tags.selectedTagIds })
        onOpenChange(false)
        await onSaved?.()
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'errors.updateHabit', 'habit'))
      }
    },
    [assignTags, formHelpers, habit, onOpenChange, onSaved, originalEndDate, reminderTimes, selectedGoalIds, showError, tags, translate, updateHabit],
  )

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={t('habits.editHabit')}
        description={t('habits.form.editDescription')}
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
        <form className="space-y-10" onSubmit={handleSubmit}>
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
          defaultExpanded
        />

        {/* Submit buttons — v8 footer pattern */}
        <div
          className="flex items-center justify-between"
          style={{
            paddingTop: 12,
            paddingBottom: 8,
            borderTop: '1px solid var(--hairline)',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--fg-3)',
              padding: 6,
            }}
            disabled={updateHabit.isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="appearance-none border-0 cursor-pointer disabled:opacity-50 inline-flex items-center"
            style={{
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: 8,
              gap: 6,
            }}
            disabled={updateHabit.isPending || !formHelpers.form.formState.isValid}
          >
            {updateHabit.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t('habits.saveChanges')}
          </button>
        </div>
        </form>
      </AppOverlay>
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
