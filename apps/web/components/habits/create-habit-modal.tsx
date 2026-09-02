'use client'

import { useState, useCallback, useEffect, useId, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

import { PillButton } from '@/components/ui/pill-button'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
  selectSuggestedSubHabitTitles,
} from './create-habit-modal/apply-suggestion'
import { SubHabitEditor, type SubHabitEntry } from './create-habit-modal/sub-habit-editor'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useConfig } from '@/hooks/use-config'
import { useHasProAccess } from '@/hooks/use-profile'
import {
  applyHabitFormMode,
  buildEmptyHabitFormValues,
  buildHabitFormPatchFromSuggestion,
  EMPTY_HABIT_FORM_PROPOSAL,
  buildParentHabitFormState,
  coalesceFormText,
  extractBackendErrorCode,
  formatAPIDate,
  getFriendlyErrorMessage,
  hasHabitFormProposal,
  isFeatureEnabled,
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

interface CreateHabitSnapshot {
  tagIds: string
  goalIds: string
  subHabits: string
  reminderTimes: string
}

function hasCreateHabitChanges(
  formDirty: boolean,
  selectedTagIds: readonly string[],
  selectedGoalIds: readonly string[],
  subHabits: readonly SubHabitEntry[],
  reminderTimes: readonly number[],
  snapshot: CreateHabitSnapshot,
): boolean {
  const tagIds = JSON.stringify([...selectedTagIds].sort((left, right) => left.localeCompare(right)))
  const goalIds = JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right)))
  const subHabitValues = JSON.stringify(subHabits.map((entry) => entry.value))
  return formDirty || tagIds !== snapshot.tagIds || goalIds !== snapshot.goalIds ||
    subHabitValues !== snapshot.subHabits || JSON.stringify(reminderTimes) !== snapshot.reminderTimes
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
  const createHabit = useCreateHabit()
  const createSubHabit = useCreateSubHabit()
  const suggestion = useHabitSuggestion()
  const { config } = useConfig()
  const hasProAccess = useHasProAccess()
  const { showError, showSuccess, showInfo } = useAppToast()
  const isSubHabitMode = !!parentHabit
  const activeView = useUIStore((s) => s.activeView)
  const canUseSubHabits = isFeatureEnabled(config, 'habits.subHabits', hasProAccess ? 'pro' : 'free')

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
  const resolveSubHabitProposalRef = useRef<() => void>(() => {})
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
  const isDirty = hasCreateHabitChanges(
    formHelpers.form.formState.isDirty,
    tags.selectedTagIds,
    selectedGoalIds,
    subHabits,
    reminderTimes,
    initialSnapshot,
  )
  const { sheetRef, closeSheet } = useSheetHost()
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => closeSheet(() => onOpenChange(false)),
  })
  const navigateToUpgrade = useCallback(() => {
    closeSheet(() => {
      onOpenChange(false)
      router.push('/upgrade')
    })
  }, [closeSheet, onOpenChange, router])

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

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

      if (isSubHabitMode && !canUseSubHabits) {
        navigateToUpgrade()
        return
      }

      const subHabitValues = canUseSubHabits ? subHabits.map((entry) => entry.value) : []
      const error = formHelpers.validateAll({
        reminderTimes,
        selectedGoalIds,
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
          const request = buildCreateHabitRequest(data, reminderTimes, tags.selectedTagIds, selectedGoalIds, subHabitValues)
          await createHabit.mutateAsync(request)
        }
        closeSheet(() => onOpenChange(false))
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
    [canUseSubHabits, closeSheet, createHabit, createSubHabit, formHelpers, isSubHabitMode, navigateToUpgrade, onOpenChange, parentHabit, reminderTimes, selectedGoalIds, showError, subHabits, tags, translate],
  )

  const handleSuggest = useCallback(
    async () => {
      const title = coalesceFormText(formHelpers.form.getValues('title')).trim()
      if (title.length === 0) return EMPTY_HABIT_FORM_PROPOSAL
      try {
        const patch = buildHabitFormPatchFromSuggestion(
          await suggestion.mutateAsync({ title, language: locale }),
        )

        const appliedSetup = applySuggestionSchedule(patch, formHelpers)

        const appliedChecklist = applySuggestionChecklist(patch, formHelpers.form)

        const filledSubHabits = subHabits.filter((entry) => entry.value.trim().length > 0)
        const suggestedSubHabitTitles = selectSuggestedSubHabitTitles(
          filledSubHabits.map((entry) => entry.value),
          patch.subHabitTitles,
          canUseSubHabits,
        )
        const appliedSubHabits = suggestedSubHabitTitles.length > 0
        if (appliedSubHabits) {
          setSubHabits([
            ...filledSubHabits,
            ...suggestedSubHabitTitles.map((subHabitTitle) => createSubHabitEntry(subHabitTitle)),
          ])
        }

        if (appliedChecklist || appliedSubHabits) {
          setExpandAdvancedSignal((value) => value + 1)
        }

        const proposal = {
          setup: appliedSetup,
          checklist: appliedChecklist,
          subHabits: appliedSubHabits,
        }
        const appliedAnything = hasHabitFormProposal(proposal)
        if (appliedAnything) {
          showSuccess(t('habits.form.aiSuggestApplied'))
        } else {
          showInfo(t('habits.form.aiSuggestEmpty'))
        }
        return proposal
      } catch (error: unknown) {
        showError(
          extractBackendErrorCode(error) === 'PAY_GATE'
            ? t('habits.form.aiSuggestLimitReached')
            : t('habits.form.aiSuggestError'),
        )
        return EMPTY_HABIT_FORM_PROPOSAL
      }
    },
    [canUseSubHabits, formHelpers, locale, showError, showInfo, showSuccess, subHabits, suggestion, t],
  )

  const isPending = createHabit.isPending || createSubHabit.isPending

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    resolveSubHabitProposalRef.current()
    setSubHabits((prev) => prev.map((s) => s.id === id ? { ...s, value } : s))
  }, [])

  const removeSubHabit = useCallback((id: string) => {
    resolveSubHabitProposalRef.current()
    setSubHabits((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const addSubHabit = useCallback(() => {
    resolveSubHabitProposalRef.current()
    setSubHabits((prev) => [...prev, createSubHabitEntry()])
  }, [])
  const handleResolveSubHabitProposalReady = useCallback((resolve: () => void) => {
    resolveSubHabitProposalRef.current = resolve
  }, [])

  function renderCreateSheet() {
    if (!open) return null
    return (
      <Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? () => onOpenChange(false) : undefined}
        title={isSubHabitMode ? t('habits.createSubHabit') : t('habits.createHabit')}
        actions={(
          <div className="flex items-center justify-end" style={{ gap: 12 }}>
            <PillButton
              variant="ghost"
              disabled={isPending}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              formId={formId}
              disabled={isPending || watchedTitle.trim().length === 0}
            >
              {t('common.create')}
            </PillButton>
          </div>
        )}
      >
        <p className="mb-4 text-sm text-[var(--fg-3)]">
          {isSubHabitMode
            ? t('habits.form.createSubHabitDescription')
            : t('habits.form.createDescription')}
        </p>
        <form id={formId} onSubmit={(event) => void handleSubmit(event)}>
          <HabitFormFields
            formHelpers={formHelpers}
            titleInputRef={titleInputRef}
            tags={tags}
            selectedGoalIds={selectedGoalIds}
            atGoalLimit={atGoalLimit}
            onToggleGoal={toggleGoal}
            reminderTimes={reminderTimes}
            onReminderTimesChange={setReminderTimes}
            onResolveSubHabitProposalReady={handleResolveSubHabitProposalReady}
            onReminderEnabledChange={handleReminderEnabledChange}
            expandAdvancedSignal={expandAdvancedSignal}
            onSuggestSetup={isSubHabitMode ? undefined : handleSuggest}
            isSuggesting={suggestion.isPending}
            readPhraseLocally
            lockedGeneral={parentHabit?.isGeneral ?? null}
          >
            {!isSubHabitMode ? (
              <SubHabitEditor
                subHabits={subHabits}
                onUpdateSubHabit={updateSubHabitValue}
                onRemoveSubHabit={removeSubHabit}
                onAddSubHabit={addSubHabit}
              />
            ) : null}
          </HabitFormFields>
        </form>
      </Sheet>
    )
  }

  return (
    <>
      {renderCreateSheet()}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
