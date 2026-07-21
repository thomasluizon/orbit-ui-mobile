'use client'

import { useState, useCallback, useEffect, useId, useRef } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
} from './create-habit-modal/apply-suggestion'
import { SubHabitEditor, type SubHabitEntry } from './create-habit-modal/sub-habit-editor'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useProfile } from '@/hooks/use-profile'
import {
  applyHabitFormMode,
  buildEmptyHabitFormValues,
  buildHabitFormPatchFromSuggestion,
  buildParentHabitFormState,
  coalesceFormText,
  extractBackendErrorCode,
  formatAPIDate,
  getFriendlyErrorMessage,
  resolveAutoManagedReminderEnabled,
  toggleSelectedId,
} from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildSubHabitRequest, buildCreateHabitRequest } from '@/lib/habit-request-builders'
import {
  MAX_GOALS_PER_HABIT,
  habitFormSchema,
} from '@orbit/shared/validation'

function createSubHabitEntry(value = ''): SubHabitEntry {
  return { id: crypto.randomUUID(), value }
}

interface CreateHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

// react-doctor-disable-next-line no-giant-component -- create/sub-habit modal orchestrating the shared form, tag/goal/sub-habit/reminder state, AI-suggest, and dismiss-guard as one flow; extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CreateHabitModal({
  open,
  onOpenChange,
  initialDate,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const t = useTranslations()
  const router = useRouter()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const locale = useLocale()
  const { profile } = useProfile()
  const createHabit = useCreateHabit()
  const createSubHabit = useCreateSubHabit()
  const suggestion = useHabitSuggestion()
  const { showError, showSuccess, showInfo } = useAppToast()
  const isSubHabitMode = !!parentHabit
  const hasProAccess = profile?.hasProAccess ?? false
  const activeView = useUIStore((s) => s.activeView)

  const formHelpers = useHabitForm({
    initialData: {
      dueDate: initialDate ?? formatAPIDate(new Date()),
    },
  })

  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [subHabits, setSubHabits] = useState<SubHabitEntry[]>([])
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [reminderWasManuallyToggled, setReminderWasManuallyToggled] = useState(false)
  const [expandAdvancedSignal, setExpandAdvancedSignal] = useState(0)
  const [initialSnapshot, setInitialSnapshot] = useState({
    tagIds: '[]',
    goalIds: '[]',
    subHabits: '[]',
    reminderTimes: '[0,15]',
  })

  const formId = useId()
  const watchedTitle = coalesceFormText(formHelpers.form.watch('title'))
  const watchedDueTime = formHelpers.form.watch('dueTime') ?? ''
  const watchedReminderEnabled = formHelpers.form.watch('reminderEnabled') ?? false
  const watchedScheduledReminders = formHelpers.form.watch('scheduledReminders') ?? []

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialSnapshot.tagIds ||
    JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialSnapshot.goalIds ||
    JSON.stringify(subHabits.map((entry) => entry.value)) !== initialSnapshot.subHabits ||
    JSON.stringify(reminderTimes) !== initialSnapshot.reminderTimes
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => onOpenChange(false),
  })

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  useEffect(() => {
    if (!open || !isSubHabitMode || !profile || profile.hasProAccess) return

    // react-doctor-disable-next-line no-prop-callback-in-effect -- pro-access gate, not a render-sync of local state: closes the modal only when a non-pro user opens sub-habit mode, then redirects to /upgrade https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onOpenChange(false)
    // react-doctor-disable-next-line nextjs-no-client-side-redirect -- gate depends on client-fetched profile.hasProAccess (useProfile); there is no server-side signal to redirect on https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    router.push('/upgrade')
  }, [isSubHabitMode, onOpenChange, open, profile, router])

  const resetOnOpenRef = useRef({ initialDate, parentHabit, activeView, formHelpers, tags })
  useEffect(() => {
    resetOnOpenRef.current = { initialDate, parentHabit, activeView, formHelpers, tags }
  })

  useEffect(() => {
    if (!open) return

    void Promise.resolve().then(() => {
      const { initialDate, parentHabit, activeView, formHelpers, tags } = resetOnOpenRef.current
      const fallbackDate = initialDate ?? formatAPIDate(new Date())

      setReminderWasManuallyToggled(false)
      setExpandAdvancedSignal(0)
      formHelpers.form.reset(buildEmptyHabitFormValues(fallbackDate))
      tags.resetTags()
      setSelectedGoalIds([])
      setSubHabits([])
      setReminderTimes([0, 15])

      let prefill: ReturnType<typeof buildParentHabitFormState> | null = null

      if (parentHabit) {
        prefill = buildParentHabitFormState(parentHabit, fallbackDate)
        formHelpers.form.reset(prefill.formValues)
        applyHabitFormMode(prefill.mode, formHelpers)
        tags.resetTags(prefill.selectedTagIds)
        setSelectedGoalIds(prefill.selectedGoalIds)
        setReminderTimes(prefill.reminderTimes)
      } else if (activeView === 'general') {
        formHelpers.setGeneral()
      }

      setInitialSnapshot({
        tagIds: JSON.stringify(
          [...(prefill?.selectedTagIds ?? [])].sort((left, right) => left.localeCompare(right)),
        ),
        goalIds: JSON.stringify(
          [...(prefill?.selectedGoalIds ?? [])].sort((left, right) => left.localeCompare(right)),
        ),
        subHabits: JSON.stringify([]),
        reminderTimes: JSON.stringify(prefill?.reminderTimes ?? [0, 15]),
      })
    })
    // react-doctor-disable-next-line exhaustive-deps -- reset-on-open must run once per open transition only, never re-fire on formHelpers/tags/parentHabit reference churn while already open; latest values are read from resetOnOpenRef, updated every render https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [open])

  const [previousHasProAccess, setPreviousHasProAccess] = useState(hasProAccess)
  if (hasProAccess !== previousHasProAccess) {
    setPreviousHasProAccess(hasProAccess)
    if (!hasProAccess && subHabits.length > 0) setSubHabits([])
  }

  useEffect(() => {
    if (!open) return

    const nextReminderEnabled = resolveAutoManagedReminderEnabled({
      dueTime: watchedDueTime,
      scheduledReminderCount: watchedScheduledReminders.length,
      reminderEnabled: watchedReminderEnabled,
      reminderWasManuallyToggled,
    })

    if (nextReminderEnabled === null || nextReminderEnabled === watchedReminderEnabled) {
      return
    }

    formHelpers.form.setValue('reminderEnabled', nextReminderEnabled, {
      shouldDirty: true,
    })
  }, [formHelpers.form, open, reminderWasManuallyToggled, watchedDueTime, watchedReminderEnabled, watchedScheduledReminders.length])

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    setReminderWasManuallyToggled(true)
    formHelpers.form.setValue('reminderEnabled', nextEnabled, {
      shouldDirty: true,
    })
  }, [formHelpers.form])

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (isSubHabitMode && !hasProAccess) {
        onOpenChange(false)
        router.push('/upgrade')
        return
      }

      const permittedGoalIds = hasProAccess ? selectedGoalIds : []
      const subHabitValues = hasProAccess ? subHabits.map((entry) => entry.value) : []
      const error = formHelpers.validateAll({
        reminderTimes,
        selectedGoalIds: permittedGoalIds,
        selectedTagIds: tags.selectedTagIds,
        subHabits: subHabitValues,
      })
      if (error) {
        showError(error)
        return
      }
      const data = habitFormSchema.parse(formHelpers.form.getValues())

      try {
        if (isSubHabitMode) {
          const subRequest = buildSubHabitRequest(data, reminderTimes, tags.selectedTagIds)
          await createSubHabit.mutateAsync({ parentId: parentHabit.id, data: subRequest })
        } else {
          const request = buildCreateHabitRequest(data, reminderTimes, tags.selectedTagIds, permittedGoalIds, subHabitValues)
          await createHabit.mutateAsync(request)
        }
        onOpenChange(false)
      } catch (error: unknown) {
        showError(
          getFriendlyErrorMessage(
            error,
            translate,
            isSubHabitMode ? 'errors.createSubHabit' : 'errors.createHabit',
            isSubHabitMode ? 'subHabit' : 'habit',
          ),
        )
      }
    },
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess is derived from profile.hasProAccess every render and already listed; the callback keys off the resolved boolean, not the raw profile member https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [createHabit, createSubHabit, formHelpers, hasProAccess, isSubHabitMode, onOpenChange, parentHabit, reminderTimes, router, selectedGoalIds, showError, subHabits, tags, translate],
  )

  const handleSuggest = useCallback(
    async () => {
      const title = coalesceFormText(formHelpers.form.getValues('title')).trim()
      if (title.length === 0) return
      try {
        const patch = buildHabitFormPatchFromSuggestion(
          await suggestion.mutateAsync({ title, language: locale }),
        )

        applySuggestionSchedule(patch, formHelpers)

        const appliedChecklist = applySuggestionChecklist(patch, formHelpers.form)

        const appliedSubHabits = hasProAccess && patch.subHabitTitles.length > 0
        if (appliedSubHabits) {
          setSubHabits((prev) => [
            ...prev.filter((entry) => entry.value.trim().length > 0),
            ...patch.subHabitTitles.map((subHabitTitle) => createSubHabitEntry(subHabitTitle)),
          ])
        }

        if (appliedChecklist || appliedSubHabits) {
          setExpandAdvancedSignal((value) => value + 1)
        }

        const appliedAnything =
          patch.emoji !== null ||
          patch.frequencyUnit !== null ||
          patch.days.length > 0 ||
          patch.dueTime !== null ||
          appliedChecklist ||
          appliedSubHabits
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
    },
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess is derived from profile.hasProAccess every render and already listed; the callback keys off the resolved boolean, not the raw profile member https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [formHelpers, hasProAccess, locale, showError, showInfo, showSuccess, suggestion, t],
  )

  const isPending = createHabit.isPending || createSubHabit.isPending

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    setSubHabits((prev) => prev.map((s) => s.id === id ? { ...s, value } : s))
  }, [])

  const removeSubHabit = useCallback((id: string) => {
    setSubHabits((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={isSubHabitMode ? t('habits.createSubHabit') : t('habits.createHabit')}
        description={
          isSubHabitMode
            ? t('habits.form.createSubHabitDescription')
            : t('habits.form.createDescription')
        }
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
        initialFocusRef={titleInputRef}
        panelWidth="wide"
        footer={
          <div className="flex items-center justify-end" style={{ gap: 12 }}>
            <PillButton
              variant="ghost"
              disabled={isPending}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              type="submit"
              form={formId}
              glow={false}
              disabled={isPending || watchedTitle.trim().length === 0}
              dataTestId="habit-create-submit"
              leading={
                isPending ? (
                  <Loader2 className="size-[18px] animate-spin" />
                ) : (
                  <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                )
              }
            >
              {t('common.create')}
            </PillButton>
          </div>
        }
      >
        <form id={formId} onSubmit={(e) => void handleSubmit(e)}>
        <HabitFormFields
          formHelpers={formHelpers}
          titleInputRef={titleInputRef}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
          onReminderEnabledChange={handleReminderEnabledChange}
          expandAdvancedSignal={expandAdvancedSignal}
          onSuggestSetup={isSubHabitMode ? undefined : () => void handleSuggest()}
          isSuggesting={suggestion.isPending}
          lockedGeneral={parentHabit?.isGeneral ?? null}
        >
          {!isSubHabitMode && (
            <SubHabitEditor
              subHabits={subHabits}
              hasProAccess={hasProAccess}
              onUpdateSubHabit={updateSubHabitValue}
              onRemoveSubHabit={removeSubHabit}
              onAddSubHabit={() =>
                setSubHabits((prev) => [...prev, createSubHabitEntry()])
              }
              onUpgrade={() => router.push('/upgrade')}
            />
          )}
        </HabitFormFields>
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
