'use client'

import { useState, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { HabitFormFields } from './habit-form-fields'
import {
  applySuggestionChecklist,
  applySuggestionSchedule,
} from './create-habit-modal/apply-suggestion'
import { useReminderPermission } from '@/hooks/use-reminder-permission'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { useUpdateHabit, useHabitDetail } from '@/hooks/use-habits'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  applyHabitEmojiSuggestion,
  reportHabitFormValidationError,
  buildHabitFormPatchFromSuggestion,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  createHabitFormSuggestionRevision,
  extractBackendErrorCode,
  extractBackendStatus,
  getFriendlyErrorMessage,
  getHabitDisplayStartDate,
  hasHabitFormProposal,
  rebaseSelectedIds,
  toggleSelectedId,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildUpdateHabitRequest } from '@/lib/habit-request-builders'
import { MAX_GOALS_PER_HABIT, habitFormSchema } from '@orbit/shared/validation'
import { createSuggestionRequestCoordinator } from '@orbit/shared/hooks'

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

export function EditHabitModal(props: Readonly<EditHabitModalProps>) {
  const generation = useAccountGeneration()
  if (!props.open) return null
  return <EditHabitDraft key={`${generation}:${props.habit?.id}`} {...props} />
}

function EditHabitDraft({
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
  const { isOnline } = useOffline()
  const updateHabit = useUpdateHabit()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const submittingRef = useRef(false)
  const mountedRef = useRef(true)
  useLayoutEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const suggestion = useHabitSuggestion()
  const [isEmojiSuggesting, setIsEmojiSuggesting] = useState(false)
  const [emojiFailure, setEmojiFailure] = useState<{ title: string; message: string; atLimit: boolean; habitId: string | null } | null>(null)
  const { showError, showSuccess, showInfo } = useAppToast()

  const { requestPermission: requestReminderPermission } = useReminderPermission(false, () => {})
  const formHelpers = useHabitForm()
  const [suggestionRevision] = useState(createHabitFormSuggestionRevision)
  const [suggestionRequests] = useState(createSuggestionRequestCoordinator)
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
      await tags.acceptSuggestedTag(args[0], (name, color) => {
        tags.setNewTagName(name)
        tags.setNewTagColor(color)
        tags.setShowNewTag(true)
        return Promise.resolve(null)
      })
    },
    deleteTag: async (...args: Parameters<typeof tags.deleteTag>) => {
      relationshipFieldsTouchedRef.current.tagIds = true
      await tags.deleteTag(...args)
    },
  }), [tags])
  const formId = useId()
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])
  const [originalEndDate, setOriginalEndDate] = useState('')
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15])
  const [initialTagIds, setInitialTagIds] = useState('[]')
  const [initialGoalIds, setInitialGoalIds] = useState('[]')
  const [initialReminderTimes, setInitialReminderTimes] = useState('[0,15]')
  const relationshipFieldsHydratedRef = useRef(false)
  const relationshipSelectionBaselineRef = useRef({ goalIds: [] as string[], tagIds: [] as string[] })
  const relationshipSessionHabitIdRef = useRef<string | null>(null)
  const previousRelationshipFieldsLoadedRef = useRef(relationshipFieldsLoaded)

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
    isDirty: isDirty || uncertain,
    onDismiss: () => closeSheet(() => onOpenChange(false)),
  })

  const {
    data: habitDetail,
    isPending: detailPending,
    error: detailError,
    refetch: refetchDetail,
  } = useHabitDetail(open && habit ? habit.id : null)
  const detailFieldsPending = open && !!habit && detailPending
  const childrenIsGeneral = habitDetail?.children[0]?.isGeneral ?? null
  const resolvedLockedGeneral = childrenIsGeneral ?? lockedGeneral ?? null

  const toggleGoal = useCallback((goalId: string) => {
    relationshipFieldsTouchedRef.current.goalIds = true
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId))
  }, [])

  const handleSlipAlertEnabledChange = useCallback((nextEnabled: boolean) => {
    relationshipFieldsTouchedRef.current.slipAlertEnabled = true
    formHelpers.form.setValue('slipAlertEnabled', nextEnabled, { shouldDirty: true })
  }, [formHelpers.form])

  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(detailError, translate, 'errors.fetchHabits', 'habit'),
      )
    }
  }, [detailError, showError, translate])

  const sessionHabitId = open && habit ? habit.id : null
  useLayoutEffect(() => {
    suggestionRevision.advance()
  }, [sessionHabitId, suggestionRevision])
  useEffect(() => {
    suggestionRequests.updateContext(sessionHabitId, watchedTitle)
  }, [sessionHabitId, suggestionRequests, watchedTitle])
  useEffect(
    () => () => suggestionRequests.updateContext(null, ''),
    [suggestionRequests],
  )
  const sessionDetailId = habitDetail?.id ?? null
  const previousSessionRef = useRef<{
    habitId: string | null
    detailId: string | null
  }>({ habitId: null, detailId: null })
  useLayoutEffect(() => {
    if (sessionHabitId !== relationshipSessionHabitIdRef.current) {
      relationshipSessionHabitIdRef.current = sessionHabitId
      previousRelationshipFieldsLoadedRef.current = relationshipFieldsLoaded
      relationshipFieldsTouchedRef.current = {
        goalIds: false,
        tagIds: false,
        slipAlertEnabled: false,
      }
      relationshipSelectionBaselineRef.current = { goalIds: [], tagIds: [] }
      return
    }

    const relationshipAuthorityArrived =
      !previousRelationshipFieldsLoadedRef.current && relationshipFieldsLoaded
    previousRelationshipFieldsLoadedRef.current = relationshipFieldsLoaded
    if (!relationshipAuthorityArrived || !open || !habit) return

    const prefill = buildEditHabitFormState(habit, habitDetail)
    const touched = relationshipFieldsTouchedRef.current
    const baseline = relationshipSelectionBaselineRef.current
    const authoritativeTagIds = prefill.selectedTagIds
    const authoritativeGoalIds = prefill.selectedGoalIds
    tags.resetTags(touched.tagIds
      ? rebaseSelectedIds(authoritativeTagIds, baseline.tagIds, tags.selectedTagIds)
      : authoritativeTagIds)
    setSelectedGoalIds((currentGoalIds) => touched.goalIds
      ? rebaseSelectedIds(authoritativeGoalIds, baseline.goalIds, currentGoalIds)
      : authoritativeGoalIds)
    setInitialTagIds(
      JSON.stringify([...authoritativeTagIds].sort((left, right) => left.localeCompare(right))),
    )
    setInitialGoalIds(
      JSON.stringify([...authoritativeGoalIds].sort((left, right) => left.localeCompare(right))),
    )
    relationshipSelectionBaselineRef.current = {
      goalIds: authoritativeGoalIds,
      tagIds: authoritativeTagIds,
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
    if (habitChanged) { setEmojiFailure(null); formHelpers.clearBackendErrors() }
    formHelpers.resetModeDrafts()
    formHelpers.form.reset(formValues)
    setOriginalEndDate(prefill.originalEndDate)
    setReminderTimes(prefill.reminderTimes)
    if (!touched.tagIds) {
      tags.resetTags(prefill.selectedTagIds)
      relationshipSelectionBaselineRef.current.tagIds = prefill.selectedTagIds
      setInitialTagIds(
        JSON.stringify([...prefill.selectedTagIds].sort((left, right) => left.localeCompare(right))),
      )
    }
    if (!touched.goalIds) {
      setSelectedGoalIds(prefill.selectedGoalIds)
      relationshipSelectionBaselineRef.current.goalIds = prefill.selectedGoalIds
      setInitialGoalIds(
        JSON.stringify([...prefill.selectedGoalIds].sort((left, right) => left.localeCompare(right))),
      )
    }
    setInitialReminderTimes(JSON.stringify(prefill.reminderTimes))
    relationshipFieldsHydratedRef.current = relationshipFieldsLoaded
    applyHabitFormMode(prefill.mode, formHelpers)
  }, [formHelpers, habit, habitDetail, open, relationshipFieldsLoaded, sessionDetailId, sessionHabitId, tags])

  async function prepareSave() {
    if (!formHelpers.form.getValues('itemType')) { formHelpers.validateAll(); return null }
    if (!await formHelpers.form.trigger(undefined, { shouldFocus: true })) return null
    const error = formHelpers.validateAll({
      reminderTimes,
      selectedGoalIds,
      selectedTagIds: tags.selectedTagIds,
    })

    if (error) {
      reportHabitFormValidationError(error, formHelpers.form.getFieldState, showError)
      return null
    }
    const data = habitFormSchema.parse(formHelpers.form.getValues())
    if (data.reminderEnabled) requestReminderPermission()

    const request = buildUpdateHabitRequest(
      data,
      formHelpers.isOneTime,
      originalEndDate,
      reminderTimes,
      selectedGoalIds,
    )
    const goalIdsChanged = JSON.stringify([...selectedGoalIds].sort((left, right) => left.localeCompare(right))) !== initialGoalIds
    const tagIdsChanged = JSON.stringify([...tags.selectedTagIds].sort((left, right) => left.localeCompare(right))) !== initialTagIds
    const slipAlertChanged = !!formHelpers.form.formState.dirtyFields.slipAlertEnabled

    if (!relationshipFieldsHydratedRef.current && !goalIdsChanged) delete request.goalIds
    if (!relationshipFieldsHydratedRef.current && !slipAlertChanged) delete request.slipAlertEnabled

    if (relationshipFieldsHydratedRef.current || tagIdsChanged) request.tagIds = [...tags.selectedTagIds]
    return request
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!habit || submittingRef.current || !isOnline) return
    submittingRef.current = true
    const generation = getAccountGeneration()
    const isCurrent = () => mountedRef.current && getAccountGeneration() === generation
    try {
      const request = await prepareSave()
      if (!request || !isCurrent()) return
      setSaving(true)
      setSaveError(null)
      try {
        await updateHabit.mutateAsync({ habitId: habit.id, data: request })
        if (!isCurrent()) return
        setUncertain(false)
        closeSheet(() => onOpenChange(false))
        await onSaved?.()
      } catch (error: unknown) {
        if (!isCurrent()) return
        if (formHelpers.reportBackendErrors(error)) return
        const status = extractBackendStatus(error)
        const unknownOutcome = status === undefined || status >= 500 || status === 408
        setUncertain((previous) => previous || unknownOutcome)
        setSaveError(unknownOutcome ? t('habits.form.saveUncertain') : getFriendlyErrorMessage(error, translate, 'errors.updateHabit', 'habit'))
        if (unknownOutcome) await refetchDetail()
      }
    } finally {
      submittingRef.current = false
      if (isCurrent()) setSaving(false)
    }
  }

  const handleSuggestEmoji = useCallback(async () => {
    const currentTitle = coalesceFormText(formHelpers.form.getValues('title'))
    const title = currentTitle.trim()
    if (!title) return EMPTY_HABIT_FORM_PROPOSAL
    suggestionRequests.updateContext(sessionHabitId, currentTitle)
    const request = suggestionRequests.begin()
    if (!request) return null
    const requestRevision = suggestionRevision.advance()
    setIsEmojiSuggesting(true)
    setEmojiFailure(null)
    const isCurrent = () => suggestionRevision.isCurrent(requestRevision) && suggestionRequests.isCurrent(
      request, coalesceFormText(formHelpers.form.getValues('title')),
    )
    try {
      const response = await suggestion.mutateAsync({ title, language: locale })
      if (!isCurrent()) return null
      const patch = buildHabitFormPatchFromSuggestion(response)
      const appliedEmoji = applyHabitEmojiSuggestion(patch.emoji, formHelpers.form.getValues('emoji'), (emoji) => {
        formHelpers.form.setValue('emoji', emoji, { shouldDirty: true })
      })
      if (appliedEmoji) showSuccess(t('habits.form.aiSuggestApplied'))
      else showInfo(t('habits.form.aiSuggestEmpty'))
      return { ...EMPTY_HABIT_FORM_PROPOSAL, setup: appliedEmoji }
    } catch (error: unknown) {
      if (!isCurrent()) return null
      const atLimit = extractBackendErrorCode(error) === 'PAY_GATE'
      const message = atLimit ? t('habits.form.aiSuggestLimitReached') : t('habits.form.aiSuggestError')
      setEmojiFailure({ title: currentTitle, message, atLimit, habitId: sessionHabitId })
      showError(message)
      return EMPTY_HABIT_FORM_PROPOSAL
    } finally {
      suggestionRequests.finish()
      setIsEmojiSuggesting(false)
    }
  }, [formHelpers, locale, sessionHabitId, showError, showInfo, showSuccess, suggestion, suggestionRequests, suggestionRevision, t])

  const handleSuggest = useCallback(async () => {
    const currentTitle = coalesceFormText(formHelpers.form.getValues('title'))
    const title = currentTitle.trim()
    if (title.length === 0) return EMPTY_HABIT_FORM_PROPOSAL
    suggestionRequests.updateContext(sessionHabitId, currentTitle)
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

      const proposal = {
        setup: appliedSetup,
        checklist: appliedChecklist,
        subHabits: false,
        checklistItems: appliedChecklistItems,
        subHabitItems: 0,
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
  }, [formHelpers, locale, sessionHabitId, showError, showInfo, showSuccess, suggestion, suggestionRequests, suggestionRevision, t])


  function renderEditSheet() {
    if (!open) return null
    return (
      <Sheet
        ref={sheetRef}
        open
        onClose={!saving && dismissGuard.canDismiss ? () => onOpenChange(false) : undefined}
        onAttemptDismiss={() => { if (!submittingRef.current) dismissGuard.requestDismiss() }}
        title={t(formHelpers.isOneTime ? 'habits.editTask' : 'habits.editHabit')}
        actions={(
          <ActionRow>
            <PillButton
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={dismissGuard.requestDismiss}
            >
              {t('common.cancel')}
            </PillButton>
            <PillButton
              size="sm"
              formId={formId}
              disabled={detailFieldsPending || saving || !isOnline}
              loading={saving}
            >
              {t('common.save')}
            </PillButton>
          </ActionRow>
        )}
      >
        <form id={formId} onSubmit={(event) => void handleSubmit(event)}>
        <div role="status" aria-live="polite">{saveError ? <p className="text-sm text-[var(--status-bad-text)]">{saveError}</p> : null}</div>

          <fieldset
            disabled={detailFieldsPending || saving || !isOnline}
            aria-busy={detailFieldsPending || saving || undefined}
            className={`m-0 min-w-0 border-0 p-0 transition-opacity duration-[var(--dur-base)] ${
              detailFieldsPending ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <HabitFormFields
              formHelpers={formHelpers}
              titleInputRef={titleInputRef}
              tags={trackedTags}
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={toggleGoal}
              reminderTimes={reminderTimes}
              onReminderTimesChange={setReminderTimes}
              onSlipAlertEnabledChange={handleSlipAlertEnabledChange}
              onSuggestionContextChange={suggestionRevision.advance}
              onSuggestSetup={handleSuggest}
              onSuggestEmoji={handleSuggestEmoji}
              isEmojiSuggesting={isEmojiSuggesting}
              emojiSuggestionError={emojiFailure?.habitId === sessionHabitId && emojiFailure.title === watchedTitle && !emojiFailure.atLimit ? emojiFailure.message : undefined}
              emojiSuggestionLimitReached={emojiFailure?.habitId === sessionHabitId && emojiFailure.title === watchedTitle && emojiFailure.atLimit}
              isSuggesting={suggestion.isPending}
              lockedGeneral={resolvedLockedGeneral}
              defaultExpanded
              startDate={habit && getHabitDisplayStartDate(habit)}
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
        message={uncertain ? t('habits.form.saveUncertain') : t(formHelpers.isOneTime ? 'habits.form.unsavedTask' : 'habits.form.unsavedHabit')}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}
