'use client'

import { useState, useCallback, useEffect, useId, useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
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
import { buildUpdateHabitRequest } from '@/lib/habit-request-builders'
import { MAX_GOALS_PER_HABIT, habitFormSchema } from '@orbit/shared/validation'

interface EditHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onSaved?: () => void | Promise<void>
}

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
  const formId = useId()
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')

  const watchedTitle = formHelpers.form.watch('title') ?? ''

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialTagIds ||
    JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
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

  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(detailError, translate, 'errors.fetchHabits', 'habit'),
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
        JSON.stringify([...prefill.selectedTagIds].sort((left, right) => left.localeCompare(right))),
      )
      setInitialGoalIds(
        JSON.stringify([...prefill.selectedGoalIds].sort((left, right) => left.localeCompare(right))),
      )
      setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
      applyHabitFormMode(prefill.mode, formHelpers)
    }
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
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
        initialFocusRef={titleInputRef}
        panelWidth="wide"
        footer={
          <div className="flex items-center justify-end" style={{ gap: 12 }}>
            <PillButton
              variant="ghost"
              disabled={updateHabit.isPending}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              type="submit"
              form={formId}
              glow={false}
              disabled={
                updateHabit.isPending ||
                detailFieldsPending ||
                watchedTitle.trim().length === 0
              }
              leading={
                updateHabit.isPending ? (
                  <Loader2 className="size-[18px] animate-spin" />
                ) : (
                  <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                )
              }
            >
              {t('common.save')}
            </PillButton>
          </div>
        }
      >
        <form id={formId} onSubmit={(e) => void handleSubmit(e)}>
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
          defaultExpanded
        />
        </fieldset>
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
