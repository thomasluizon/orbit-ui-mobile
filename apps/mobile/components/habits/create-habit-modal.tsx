import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useWatch } from 'react-hook-form'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'

import { PillButton } from '@/components/ui/pill-button'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
  selectSuggestedSubHabitTitles,
} from './create-habit-modal/apply-suggestion'
import { SubHabitEditor, type SubHabitEntry } from './create-habit-modal/sub-habit-editor'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useHabitForm } from '@/hooks/use-habit-form'
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
  createHabitFormSuggestionRevision,
  extractBackendErrorCode,
  formatAPIDate,
  getFriendlyErrorMessage,
  hasHabitFormProposal,
  isFeatureEnabled,
  resolveAutoManagedReminderEnabled,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  buildSubHabitRequest,
  buildCreateHabitRequest,
} from '@/lib/habit-request-builders'
import { MAX_GOALS_PER_HABIT, habitFormSchema } from '@orbit/shared/validation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

let subHabitCounter = 0
function createSubHabitEntry(value = ''): SubHabitEntry {
  subHabitCounter += 1
  return { id: `sub-${subHabitCounter}-${Date.now()}`, value }
}

function hasCreateHabitChanges({
  formDirty,
  selectedTagIds,
  selectedGoalIds,
  subHabits,
  reminderTimes,
  initialTagIds,
  initialGoalIds,
  initialSubHabits,
  initialReminderTimes,
}: Readonly<{
  formDirty: boolean
  selectedTagIds: string[]
  selectedGoalIds: string[]
  subHabits: SubHabitEntry[]
  reminderTimes: number[]
  initialTagIds: string
  initialGoalIds: string
  initialSubHabits: string
  initialReminderTimes: string
}>): boolean {
  const tagSnapshot = JSON.stringify([...selectedTagIds].sort((a, b) => a.localeCompare(b)))
  const goalSnapshot = JSON.stringify([...selectedGoalIds].sort((a, b) => a.localeCompare(b)))
  const subHabitSnapshot = JSON.stringify(subHabits.map((entry) => entry.value))
  return formDirty || tagSnapshot !== initialTagIds || goalSnapshot !== initialGoalIds ||
    subHabitSnapshot !== initialSubHabits || JSON.stringify(reminderTimes) !== initialReminderTimes
}

interface CreateHabitModalProps {
  open: boolean
  onClose: () => void
  initialDate?: string | null
  parentHabit?: NormalizedHabit | null
}

function resolveCreateSheetTitle(
  isSubHabitMode: boolean,
  t: (key: string) => string,
): string {
  return t(isSubHabitMode ? 'habits.createSubHabit' : 'habits.createHabit')
}

// react-doctor-disable-next-line no-giant-component -- form-modal shell already decomposed into create-habit-modal/* and HabitFormFields subcomponents; the remaining body is cohesive submit/suggest/reset orchestration, extraction deferred to avoid regression without device QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CreateHabitModal({
  open,
  onClose,
  initialDate,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
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
  const [suggestionRevision] = useState(createHabitFormSuggestionRevision)
  const suggestionSessionId = open ? (parentHabit?.id ?? 'root') : null
  useLayoutEffect(() => {
    suggestionRevision.advance()
  }, [suggestionRevision, suggestionSessionId])

  const tags = useTagSelection()
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [subHabits, setSubHabits] = useState<SubHabitEntry[]>([])
  const subHabitsRef = useRef<SubHabitEntry[]>([])
  const replaceSubHabits = useCallback((nextSubHabits: SubHabitEntry[]) => {
    subHabitsRef.current = nextSubHabits
    setSubHabits(nextSubHabits)
  }, [])
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const [reminderWasManuallyToggled, setReminderWasManuallyToggled] = useState(false)
  const [expandAdvancedSignal, setExpandAdvancedSignal] = useState(0)
  const flushBufferedInputsRef = useRef<() => void>(() => {})
  const resolveSubHabitProposalRef = useRef<() => void>(() => {})
  const [initialTagIdsSnapshot, setInitialTagIdsSnapshot] = useState('[]')
  const [initialGoalIdsSnapshot, setInitialGoalIdsSnapshot] = useState('[]')
  const [initialSubHabitsSnapshot, setInitialSubHabitsSnapshot] = useState('[]')
  const [initialReminderTimesSnapshot, setInitialReminderTimesSnapshot] =
    useState('[0,15]')

  const watchedTitle = coalesceFormText(
    useWatch({
      control: formHelpers.form.control,
      name: 'title',
    }),
  )
  const watchedDueTime =
    useWatch({ control: formHelpers.form.control, name: 'dueTime' }) ?? ''
  const watchedReminderEnabled =
    useWatch({
      control: formHelpers.form.control,
      name: 'reminderEnabled',
    }) ?? false
  const watchedScheduledReminders =
    useWatch({
      control: formHelpers.form.control,
      name: 'scheduledReminders',
    }) ?? []

  const atGoalLimit = selectedGoalIds.length >= MAX_GOALS_PER_HABIT
  const isDirty = hasCreateHabitChanges({
    formDirty: formHelpers.form.formState.isDirty,
    selectedTagIds: tags.selectedTagIds,
    selectedGoalIds,
    subHabits,
    reminderTimes,
    initialTagIds: initialTagIdsSnapshot,
    initialGoalIds: initialGoalIdsSnapshot,
    initialSubHabits: initialSubHabitsSnapshot,
    initialReminderTimes: initialReminderTimesSnapshot,
  })
  const { sheetRef, closeSheet } = useSheetHost()
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: () => closeSheet(onClose),
  })
  const navigateToUpgrade = useCallback(() => {
    closeSheet(() => {
      onClose()
      router.push('/upgrade')
    })
  }, [closeSheet, onClose, router])

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

      setInitialTagIdsSnapshot(
        JSON.stringify(
          [...(prefill?.selectedTagIds ?? [])].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialGoalIdsSnapshot(
        JSON.stringify(
          [...(prefill?.selectedGoalIds ?? [])].sort((left, right) =>
            left.localeCompare(right),
          ),
        ),
      )
      setInitialSubHabitsSnapshot(JSON.stringify([]))
      setInitialReminderTimesSnapshot(
        JSON.stringify(prefill?.reminderTimes ?? [0, 15]),
      )
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

    if (
      nextReminderEnabled === null ||
      nextReminderEnabled === watchedReminderEnabled
    ) {
      return
    }

    formHelpers.form.setValue('reminderEnabled', nextReminderEnabled, {
      shouldDirty: true,
    })
  }, [
    formHelpers.form,
    open,
    reminderWasManuallyToggled,
    watchedDueTime,
    watchedReminderEnabled,
    watchedScheduledReminders.length,
  ])

  const handleReminderEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      setReminderWasManuallyToggled(true)
      formHelpers.form.setValue('reminderEnabled', nextEnabled, {
        shouldDirty: true,
      })
    },
    [formHelpers.form],
  )

  const handleBufferedInputsReady = useCallback((flush: () => void) => {
    flushBufferedInputsRef.current = flush
  }, [])

  const handleSubmit = useCallback(async () => {
    flushBufferedInputsRef.current()

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
        const subRequest = buildSubHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
        )
        await createSubHabit.mutateAsync({
          parentId: parentHabit.id,
          data: subRequest,
        })
      } else {
        const request = buildCreateHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
          selectedGoalIds,
          subHabitValues,
        )
        await createHabit.mutateAsync(request)
      }
      closeSheet(onClose)
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
  }, [
    formHelpers,
    isSubHabitMode,
    parentHabit,
    tags,
    selectedGoalIds,
    canUseSubHabits,
    navigateToUpgrade,
    subHabits,
    reminderTimes,
    createHabit,
    createSubHabit,
    closeSheet,
    onClose,
    showError,
    translate,
  ])

  const handleSuggest = useCallback(async () => {
    flushBufferedInputsRef.current()
    const title = coalesceFormText(formHelpers.form.getValues('title')).trim()
    if (title.length === 0) return EMPTY_HABIT_FORM_PROPOSAL
    const requestRevision = suggestionRevision.advance()

    try {
      const response = await suggestion.mutateAsync({ title, language: i18n.language })
      if (!suggestionRevision.isCurrent(requestRevision)) return null
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
      if (!suggestionRevision.isCurrent(requestRevision)) return null
      showError(
        extractBackendErrorCode(error) === 'PAY_GATE'
          ? t('habits.form.aiSuggestLimitReached')
          : t('habits.form.aiSuggestError'),
      )
      return EMPTY_HABIT_FORM_PROPOSAL
    }
  }, [canUseSubHabits, formHelpers, i18n.language, replaceSubHabits, showError, showInfo, showSuccess, suggestion, suggestionRevision, t])

  const isPending = createHabit.isPending || createSubHabit.isPending
  const submitDisabled = isPending || watchedTitle.trim().length === 0

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    resolveSubHabitProposalRef.current()
    replaceSubHabits(
      subHabitsRef.current.map((subHabit) => subHabit.id === id ? { ...subHabit, value } : subHabit),
    )
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
  const sheetTitle = resolveCreateSheetTitle(isSubHabitMode, t)
  const lockedGeneral = parentHabit?.isGeneral ?? null

  return (
    <>
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={dismissGuard.requestDismiss}
        title={sheetTitle}
      >
        <View style={styles.scrollContent}>
          <HabitFormFields
            formHelpers={formHelpers}
            tags={tags}
            selectedGoalIds={selectedGoalIds}
            atGoalLimit={atGoalLimit}
            onToggleGoal={toggleGoal}
            reminderTimes={reminderTimes}
            onReminderTimesChange={setReminderTimes}
            onReminderEnabledChange={handleReminderEnabledChange}
            onSuggestionContextChange={suggestionRevision.advance}
            onFlushBufferedInputsReady={handleBufferedInputsReady}
            onResolveSubHabitProposalReady={handleResolveSubHabitProposalReady}
            expandAdvancedSignal={expandAdvancedSignal}
            onSuggestSetup={isSubHabitMode ? undefined : handleSuggest}
            isSuggesting={suggestion.isPending}
            readPhraseLocally
            lockedGeneral={lockedGeneral}
            onUpgrade={navigateToUpgrade}
          >
            {(proposedItemCount) => !isSubHabitMode ? (
              <SubHabitEditor
                subHabits={subHabits}
                proposedItemCount={proposedItemCount}
                onUpdateSubHabit={updateSubHabitValue}
                onRemoveSubHabit={removeSubHabit}
                onAddSubHabit={addSubHabit}
                tokens={tokens}
                styles={styles}
              />
            ) : null}
          </HabitFormFields>
        </View>

        <View style={styles.footer}>
          <PillButton
            variant="ghost"
            disabled={isPending}
            onClick={dismissGuard.requestDismiss}
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton

            disabled={submitDisabled}
            onClick={() => void handleSubmit()}

          >
            {t('common.create')}
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
      paddingBottom: 20,
      gap: 22,
    },
    fieldLabel: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },
    subHabitsSection: {
      gap: 10,
    },
    subHabitsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    subHabitsList: {
      gap: 8,
    },
    subHabitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingLeft: 14,
      paddingRight: 6,
    },
    subHabitIndex: {
      width: 16,
      textAlign: 'right',
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.24,
      color: tokens.fg3,
    },
    subHabitInput: {
      flex: 1,
      minHeight: 44,
      backgroundColor: 'transparent',
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      borderWidth: 0,
      borderRadius: 0,
      paddingVertical: 10,
      paddingHorizontal: 0,
    },
    subHabitRemoveButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addSubHabitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
    },
    addSubHabitText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.fg2,
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
