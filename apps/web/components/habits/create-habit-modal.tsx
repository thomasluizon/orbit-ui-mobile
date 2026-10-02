'use client'

import { useState, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { completeHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { HabitCreateActions } from './habit-create-actions'
import { HabitCreateFrame } from './habit-create-frame'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useSheetHost } from '@/components/ui/sheet'

import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
  selectSuggestedSubHabitTitles,
} from './create-habit-modal/apply-suggestion'
import { SubHabitEditor, type SubHabitEntry } from './create-habit-modal/sub-habit-editor'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useCreateHabit, useCreateSubHabit } from '@/hooks/use-habits'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useConfig } from '@/hooks/use-config'
import { useHasProAccess } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useAccountGeneration, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  applyHabitFormMode,
  buildEmptyHabitFormValues,
  buildHabitFormPatchFromSuggestion,
  EMPTY_HABIT_FORM_PROPOSAL,
  buildParentHabitFormState,
  coalesceFormText,
  createHabitFormSuggestionRevision,
  extractBackendErrorCode,
  formatAPIDate,
  getFriendlyErrorMessage,
  getHabitPhraseTitle,
  hasHabitFormProposal,
  isFeatureEnabled,
  resolveAutoManagedReminderEnabled,
  resolveSupportedLocale,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { HabitFormProposal, HabitPhraseFormOwnership } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildSubHabitRequest, buildCreateHabitRequest } from '@/lib/habit-request-builders'
import {
  MAX_GOALS_PER_HABIT,
  habitFormSchema,
} from '@orbit/shared/validation'
import { createSuggestionRequestCoordinator } from '@orbit/shared/hooks'

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
  presentation?: 'sheet' | 'screen'
  fromConversation?: boolean
  initialTitle?: string
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

// react-doctor-disable-next-line no-giant-component -- create/sub-habit modal orchestrating the shared form, tag/goal/sub-habit/reminder state, AI-suggest, and dismiss-guard as one flow; extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CreateHabitModal({
  open,
  onOpenChange,
  initialDate,
  initialTitle = '',
  presentation = 'sheet',
  fromConversation = false,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const accountGeneration = useAccountGeneration()
  const [openedAccountGeneration, setOpenedAccountGeneration] = useState(accountGeneration)
  const [previousOpen, setPreviousOpen] = useState(open)
  if (previousOpen !== open) {
    setPreviousOpen(open)
    setOpenedAccountGeneration(accountGeneration)
  }
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
  const { isOnline } = useOffline()
  const { showError, showSuccess, showInfo } = useAppToast()
  const isSubHabitMode = !!parentHabit
  const activeView = useUIStore((s) => s.activeView)
  const canUseSubHabits = isFeatureEnabled(config, 'habits.subHabits', hasProAccess ? 'pro' : 'free')

  const { requestPermission: requestReminderPermission } = useReminderPermission(false, () => {})
  const formHelpers = useHabitForm({
    initialData: {
      dueDate: initialDate ?? formatAPIDate(new Date()),
    },
  })

  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [subHabits, setSubHabits] = useState<SubHabitEntry[]>([])
  const subHabitsRef = useRef<SubHabitEntry[]>([])
  const replaceSubHabits = useCallback((nextSubHabits: SubHabitEntry[]) => {
    subHabitsRef.current = nextSubHabits
    setSubHabits(nextSubHabits)
  }, [])
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const phraseOwnershipRef = useRef<HabitPhraseFormOwnership>({ cadence: false, dueTime: false })
  useLayoutEffect(() => {
    if (open) phraseOwnershipRef.current = { cadence: false, dueTime: false }
  }, [open])
  const handlePhraseOwnershipChange = useCallback((ownership: HabitPhraseFormOwnership) => {
    phraseOwnershipRef.current = ownership
  }, [])
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
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null)
  const pendingNavigation = useRef<(() => void) | null>(null)
  useEffect(() => { if (leaveAction) completeHabitCreateNavigation(leaveAction) }, [leaveAction])
  const finishClose = useCallback((action: () => void) => {
    if (presentation === 'screen') setLeaveAction(() => action)
    else closeSheet(action)
  }, [closeSheet, presentation])
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => finishClose(pendingNavigation.current ?? (() => onOpenChange(false))),
  })
  const [suggestionRevision] = useState(createHabitFormSuggestionRevision)
  const [suggestionRequests] = useState(createSuggestionRequestCoordinator)
  const suggestionSessionId = open ? (parentHabit?.id ?? 'root') : null
  useLayoutEffect(() => {
    suggestionRevision.advance()
  }, [suggestionRevision, suggestionSessionId])
  useEffect(() => {
    suggestionRequests.updateContext(suggestionSessionId, watchedTitle)
  }, [suggestionRequests, suggestionSessionId, watchedTitle])
  useEffect(
    () => () => suggestionRequests.updateContext(null, ''),
    [suggestionRequests],
  )
  const navigateToUpgrade = useCallback(() => {
    if (presentation === 'screen') {
      pendingNavigation.current = () => router.push('/upgrade')
      dismissGuard.requestDismiss()
      return
    }
    finishClose(() => {
      onOpenChange(false)
      router.push('/upgrade')
    })
  }, [dismissGuard, finishClose, onOpenChange, presentation, router])

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  /**
   * Closing is the whole reset here, because the effect below rebuilds every field on the next
   * open. The three owners of this flag are a store, a detail screen and the search page, so the
   * modal reports the change to whichever one holds it rather than each of them learning it.
   */
  useResetOnAccountChange(() => {
    onOpenChange(false)
  })

  const resetOnOpenRef = useRef({ initialDate, initialTitle, parentHabit, activeView, formHelpers, tags })
  useEffect(() => {
    resetOnOpenRef.current = { initialDate, initialTitle, parentHabit, activeView, formHelpers, tags }
  })

  useEffect(() => {
    if (!open) return

    void Promise.resolve().then(() => {
      const { initialDate, initialTitle, parentHabit, activeView, formHelpers, tags } = resetOnOpenRef.current
      const fallbackDate = initialDate ?? formatAPIDate(new Date())

      setReminderWasManuallyToggled(false)
      setExpandAdvancedSignal(0)
      formHelpers.form.reset({ ...buildEmptyHabitFormValues(fallbackDate), title: initialTitle })
      tags.resetTags()
      setSelectedGoalIds([])
      replaceSubHabits([])
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
  }, [open, replaceSubHabits])

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

  const createErrorKey = isSubHabitMode ? 'errors.createSubHabit' : 'errors.createHabit'
  const createErrorEntity = isSubHabitMode ? 'subHabit' : 'habit'

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault()
      const submittingAccount = getAccountGeneration()

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
      const reminderForm = habitFormSchema.safeParse(formHelpers.form.getValues())
      if (!error && isOnline && reminderForm.success && reminderForm.data.reminderEnabled) requestReminderPermission()
      if (!await formHelpers.form.trigger(undefined, { shouldFocus: true })) return

      if (error) {
        showError(error)
        return
      }
      if (!isOnline) return
      const data = habitFormSchema.parse(formHelpers.form.getValues())

      try {
        if (isSubHabitMode) {
          const subRequest = buildSubHabitRequest(data, reminderTimes, tags.selectedTagIds)
          await createSubHabit.mutateAsync({ parentId: parentHabit.id, data: subRequest })
        } else {
          const title = getHabitPhraseTitle(data.title, resolveSupportedLocale(locale), phraseOwnershipRef.current)
          const request = buildCreateHabitRequest({ ...data, title }, reminderTimes, tags.selectedTagIds, selectedGoalIds, subHabitValues)
          await createHabit.mutateAsync(request)
        }
        if (getAccountGeneration() !== submittingAccount) return
        finishClose(() => {
          if (getAccountGeneration() === submittingAccount) onOpenChange(false)
        })
      } catch (error: unknown) {
        if (getAccountGeneration() !== submittingAccount) return
        showError(
          getFriendlyErrorMessage(
            error,
            translate,
            createErrorKey,
            createErrorEntity,
          ),
        )
      }
    },
    [requestReminderPermission, canUseSubHabits, finishClose, createErrorEntity, createErrorKey, createHabit, createSubHabit, formHelpers, isOnline, isSubHabitMode, locale, navigateToUpgrade, onOpenChange, parentHabit, reminderTimes, selectedGoalIds, showError, subHabits, tags, translate],
  )

  const handleSuggest = useCallback(
    async () => {
      const currentTitle = coalesceFormText(formHelpers.form.getValues('title'))
      const title = currentTitle.trim()
      if (title.length === 0) return EMPTY_HABIT_FORM_PROPOSAL
      suggestionRequests.updateContext(suggestionSessionId, currentTitle)
      const request = suggestionRequests.begin()
      if (!request) return null
      const requestRevision = suggestionRevision.advance()
      try {
        const response = await suggestion.mutateAsync({ title, language: locale })
        if (!suggestionRevision.isCurrent(requestRevision) || !suggestionRequests.isCurrent(
          request,
          coalesceFormText(formHelpers.form.getValues('title')),
        )) return null
        const patch = buildHabitFormPatchFromSuggestion(
          response,
        )

        const appliedSetup = applySuggestionSchedule(patch, formHelpers)

        const appliedChecklistItems = applySuggestionChecklist(patch, formHelpers.form)
        const appliedChecklist = appliedChecklistItems > 0

        const filledSubHabits = subHabitsRef.current.filter((entry) => entry.value.trim().length > 0)
        const suggestedSubHabitTitles = selectSuggestedSubHabitTitles(
          filledSubHabits.map((entry) => entry.value),
          patch.subHabitTitles,
          canUseSubHabits,
        )
        const appliedSubHabits = suggestedSubHabitTitles.length > 0
        if (appliedSubHabits) {
          replaceSubHabits([
            ...filledSubHabits,
            ...suggestedSubHabitTitles.map((subHabitTitle) => createSubHabitEntry(subHabitTitle)),
          ])
        }

        if (appliedChecklist || appliedSubHabits) {
          setExpandAdvancedSignal((value) => value + 1)
        }

        const proposal: HabitFormProposal = {
          setup: appliedSetup,
          checklist: appliedChecklist,
          subHabits: appliedSubHabits,
          checklistItems: appliedChecklistItems,
          subHabitItems: suggestedSubHabitTitles.length,
        }
        const appliedAnything = hasHabitFormProposal(proposal)
        if (appliedAnything) {
          showSuccess(t('habits.form.aiSuggestApplied'))
        } else {
          showInfo(t('habits.form.aiSuggestEmpty'))
        }
        return proposal
      } catch (error: unknown) {
        if (!suggestionRevision.isCurrent(requestRevision) || !suggestionRequests.isCurrent(
          request,
          coalesceFormText(formHelpers.form.getValues('title')),
        )) return null
        showError(
          extractBackendErrorCode(error) === 'PAY_GATE'
            ? t('habits.form.aiSuggestLimitReached')
            : t('habits.form.aiSuggestError'),
        )
        return EMPTY_HABIT_FORM_PROPOSAL
      } finally {
        suggestionRequests.finish()
      }
    },
    [canUseSubHabits, formHelpers, locale, replaceSubHabits, showError, showInfo, showSuccess, suggestion, suggestionRequests, suggestionRevision, suggestionSessionId, t],
  )


  const isPending = createHabit.isPending || createSubHabit.isPending

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    resolveSubHabitProposalRef.current()
    replaceSubHabits(subHabitsRef.current.map((subHabit) => subHabit.id === id ? { ...subHabit, value } : subHabit))
  }, [replaceSubHabits])

  const removeSubHabit = useCallback((id: string) => {
    resolveSubHabitProposalRef.current()
    replaceSubHabits(subHabitsRef.current.filter((subHabit) => subHabit.id !== id))
  }, [replaceSubHabits])

  const addSubHabit = useCallback(() => {
    resolveSubHabitProposalRef.current()
    replaceSubHabits([...subHabitsRef.current, createSubHabitEntry()])
  }, [replaceSubHabits])
  const handleResolveSubHabitProposalReady = useCallback((resolve: () => void) => {
    resolveSubHabitProposalRef.current = resolve
  }, [])

  function renderCreateSheet() {
    if (!open || openedAccountGeneration !== accountGeneration) return null
    return (
      <HabitCreateFrame
        presentation={presentation}
        fromConversation={fromConversation}
        leaving={leaveAction !== null}
        actionRefreshKey={`${isPending}:${isOnline}:${watchedTitle.trim().length === 0}`}
        onReturn={() => onOpenChange(false)}
        onNavigate={(action) => {
          pendingNavigation.current = action
          dismissGuard.requestDismiss()
        }}
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? () => onOpenChange(false) : undefined}
        onAttemptDismiss={dismissGuard.requestDismiss}
        title={isSubHabitMode ? t('habits.createSubHabit') : t('habits.form.newHabit')}
        actions={<HabitCreateActions presentation={presentation} pending={isPending}
          empty={watchedTitle.trim().length === 0} subHabit={isSubHabitMode}
          onCancel={dismissGuard.requestDismiss} online={isOnline} formId={formId} />}

      >
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
            onSuggestionContextChange={suggestionRevision.advance}
            onPhraseOwnershipChange={handlePhraseOwnershipChange}
            expandAdvancedSignal={expandAdvancedSignal}
            onSuggestSetup={isSubHabitMode ? undefined : handleSuggest}
            isSuggesting={suggestion.isPending}
            readPhraseLocally
            lockedGeneral={parentHabit?.isGeneral ?? null}
          >
            {(proposedItemCount) => !isSubHabitMode ? (
              <SubHabitEditor
                subHabits={subHabits}
                proposedItemCount={proposedItemCount}
                onUpdateSubHabit={updateSubHabitValue}
                onRemoveSubHabit={removeSubHabit}
                onAddSubHabit={addSubHabit}
              />
            ) : null}
          </HabitFormFields>
        </form>
      </HabitCreateFrame>
    )
  }

  return (
    <>
      {renderCreateSheet()}
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={() => {
          pendingNavigation.current = null
          dismissGuard.cancelDismiss()
        }}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
