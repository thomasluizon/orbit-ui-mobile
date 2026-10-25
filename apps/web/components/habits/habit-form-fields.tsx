'use client'

import { AstraGlyph } from '@/components/ui/astra-glyph'

import { X } from '@/components/ui/icons'

import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'

import { useCallback, useEffect, useState, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useController } from 'react-hook-form'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { toTime24,
  buildHabitAstraFallbackCopy,
  buildHabitEmojiSuggestionAvailability,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  formatHabitReminderLabel,
  getFriendlyErrorMessage,
  isHabitDailySchedule,
  isHabitAstraLimitReached,
  readTypedHabitPhrase,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { validateTagForm, validateEndTime } from '@orbit/shared/validation'
import { useAppToast } from '@/hooks/use-app-toast'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { HabitTypeField } from './habit-form-fields/habit-type-field'
import { HabitDateField } from './habit-form-fields/habit-date-field'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { TimeField } from '@/components/ui/time-field'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitScheduleFields } from './habit-form-fields/habit-schedule-fields'
import { HabitUnderstanding, HabitRepeatInterval } from './habit-form-fields/habit-understanding'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { TagSuggestions } from './habit-form-fields/tag-suggestions'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { useExpandAdvancedSignal } from './habit-form-fields/use-expand-advanced-signal'

function HabitEndTimeField({ formHelpers, dueTime }: Readonly<{ formHelpers: HabitFormHelpers; dueTime: string }>) {
  const t = useTranslations()
  const dueEndTime = formHelpers.form.watch('dueEndTime') ?? ''
  const error = validateEndTime(dueTime, dueEndTime)
  if (formHelpers.isGeneral) return null
  return (
    <TimeField
      label={t('habits.form.dueEndTime')}
      value={toTime24(dueEndTime)}
      disabled={!dueTime}
      hint={dueTime ? undefined : t('habits.form.endTimeRequiresStart')}
      error={error ? t(error) : undefined}
      onChange={(value) => formHelpers.form.setValue('dueEndTime', value, { shouldDirty: true })}
      onClear={() => formHelpers.form.setValue('dueEndTime', '', { shouldDirty: true })}
    />
  )
}

interface HabitFormFieldsProps extends HabitFormCommonProps<HabitFormHelpers, TagSelectionState, ReactNode> {
  titleInputRef?: RefObject<HTMLInputElement | null>
}

function renderSubHabitChildren(
  children: ReactNode | ((proposedItems: number) => ReactNode),
  proposedItems: number,
): ReactNode {
  return typeof children === 'function' ? children(proposedItems) : children
}

interface AstraFallbackProps {
  visible: boolean
  atLimit: boolean
  isSuggesting: boolean
  limitMessage: string
  readingLabel: string
  askLabel: string
  costLabel: string
  onAsk: () => void
}

function AstraFallback({
  visible,
  atLimit,
  isSuggesting,
  limitMessage,
  readingLabel,
  askLabel,
  costLabel,
  onAsk,
}: Readonly<AstraFallbackProps>) {
  if (!visible) return null
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {atLimit ? <CapacityNotice message={limitMessage} /> : null}
      <div className="flex flex-col items-start" style={{ gap: 8 }}>
        <PillButton minimumHeight={48} borderless iconOnly label={askLabel} variant="ghost" loading={isSuggesting} hint={isSuggesting ? readingLabel : undefined} disabled={atLimit} onClick={onAsk}><AstraGlyph size={20} /></PillButton>
        {!atLimit ? <p className="text-xs text-[var(--fg-3)]">{costLabel}</p> : null}
      </div>
    </div>
  )
}

interface ReminderEditorsProps {
  dueTime: string
  reminderEnabled: boolean
  reminderTimes: number[]
  scheduledReminders: { when: ScheduledReminderWhen; time: string }[]
  onReminderTimesChange: (times: number[]) => void
  onToggle: () => void
  onSetScheduledReminders: (items: { when: ScheduledReminderWhen; time: string }[]) => void
  onValidationError: (message: string) => void
  t: ReturnType<typeof useTranslations>
}

interface SubHabitSectionProps {
  proposed: boolean
  children?: ReactNode
  t: ReturnType<typeof useTranslations>
}

interface EndDateEditorProps {
  visible: boolean
  value: string
  onChange: (value: string) => void
  t: (key: string) => string
}

function EndDateEditor({ visible, value, onChange, t }: Readonly<EndDateEditorProps>) {
  const [focusRequest, setFocusRequest] = useState(0)
  if (!visible) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.endDate')}</FormSectionLabel>
      <DateField label={t('habits.form.endDate')} value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={onChange} focusRequest={focusRequest} />
      {value ? <div className="flex justify-end">
        <PillButton variant="ghost" iconOnly label={t('habits.form.removeEndDate')} onClick={() => {
          onChange('')
          setFocusRequest((request) => request + 1)
        }}><X size={20} aria-hidden="true" /></PillButton>
      </div> : null}
    </section>
  )
}

interface SlipAlertEditorProps {
  visible: boolean
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

function SlipAlertEditor({
  visible,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
  t,
}: Readonly<SlipAlertEditorProps>) {
  if (!visible) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.slipAlert')}</FormSectionLabel>
      <SlipAlertSection inline hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} t={t} />
    </section>
  )
}

function SubHabitSection({
  proposed,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  if (!children) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.subHabits')}</FormSectionLabel>
      <Proposed proposed={proposed} scope="field" label={t('habits.detail.proposed')}>
        {children}
      </Proposed>
    </section>
  )
}

function ReminderEditors({
  dueTime,
  reminderEnabled,
  reminderTimes,
  scheduledReminders,
  onReminderTimesChange,
  onToggle,
  onSetScheduledReminders,
  onValidationError,
  t,
}: Readonly<ReminderEditorsProps>) {
  if (!dueTime) {
    return <ScheduledReminderSection inline reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} t={t} />
  }
  return (
    <ReminderSection inline toggleLabel={t('habits.form.reminder')} reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} onToggleReminder={onToggle} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, (key) => t(key))} scheduledReminderCount={scheduledReminders.length} onValidationError={onValidationError} t={t}>
      <ScheduledReminderSection inline reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} offsetReminderCount={reminderTimes.length} nested t={t} />
    </ReminderSection>
  )
}

function HabitTimingFields({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; reminderTimes: number[]; onReminderTimesChange: (times: number[]) => void; showError: (message: string) => void }>) {
  const t = useTranslations()
  const { form } = formHelpers
  const dueTime = form.watch('dueTime') ?? ''
  const reminderEnabled = form.watch('reminderEnabled') ?? false
  const scheduledReminders = form.watch('scheduledReminders') ?? []
  if (formHelpers.isGeneral) return null
  return (
    <>
            <section className="flex flex-col gap-4">
              <TimeField
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={toTime24(dueTime)}
                onChange={controller.setDueTime}
                onClear={controller.clearDueTime}
              />
              <HabitEndTimeField formHelpers={formHelpers} dueTime={dueTime} />
            </section>

            <section className="flex flex-col gap-2">
              <FormSectionLabel>{t('habits.form.reminders')}</FormSectionLabel>
              <ReminderEditors
                dueTime={dueTime}
                reminderEnabled={reminderEnabled}
                reminderTimes={reminderTimes}
                scheduledReminders={scheduledReminders}
                onReminderTimesChange={onReminderTimesChange}
                onToggle={() => controller.setReminderEnabled(!reminderEnabled)}
                onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })}
                onValidationError={showError}
                t={t}
              />
            </section>

    </>
  )
}

function HabitAvoidanceFields({ formHelpers, controller, hasProAccess }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; hasProAccess: boolean }>) {
  const t = useTranslations()
  const { form } = formHelpers
  const isBadHabit = form.watch('isBadHabit') ?? false
  const slipAlertEnabled = form.watch('slipAlertEnabled') ?? false
  if (formHelpers.isGeneral) return null
  return (
    <>
            {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Habit Create fBad controls this label under D42. */}
            <ListRow placement="column" title={t('habits.form.habitTypeAvoid')} description={t('habits.form.habitTypeAvoidHint')} toggle={{ checked: isBadHabit, onChange: (checked) => form.setValue('isBadHabit', checked, { shouldDirty: true }) }} />


            <SlipAlertEditor visible={isBadHabit} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} t={t} />

    </>
  )
}

export function HabitFormFields({
  formHelpers,
  habitId,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  onGoalCreated,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onPhraseOwnershipChange,
  onResolveSubHabitProposalReady,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  onSuggestEmoji,
  isEmojiSuggesting = false,
  emojiSuggestionError,
  emojiSuggestionLimitReached = false,
  isSuggesting = false,
  readPhraseLocally = false,
  lockedGeneral = null,
  defaultExpanded = false,
  parentField,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const language = useLocale()
  const locale = resolveSupportedLocale(language)
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { watch, setValue, formState: { errors } } = form
  const itemType = watch('itemType')
  const { field: titleField } = useController({ control: form.control, name: 'title' })
  const title = coalesceFormText(watch('title'))
  const emoji = watch('emoji') ?? ''
  const watchedDays = watch('days')
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const intervalWeeks = watch('intervalWeeks') ?? 1
  const frequencyUnit = watch('frequencyUnit')
  const frequencyQuantity = watch('frequencyQuantity') ?? (frequencyUnit ? 0 : 3)
  const isFlexible = watch('isFlexible') ?? false
  const dueTime = watch('dueTime') ?? ''
  const endDate = watch('endDate') ?? ''
  const description = watch('description') ?? ''
  const checklistItems = watch('checklistItems') ?? []
  const detailsId = useId()
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(defaultExpanded)
  const [detailsPresented, setDetailsPresented] = useAccountScopedState(defaultExpanded)
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const descriptionFailure = formHelpers.backendFieldErrors.description
  const [proposal, setProposal] = useAccountScopedState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useAccountScopedState({ cadence: false, dueTime: false })
  const lastLocallyReadPhraseRef = useRef<{ title: string; itemType: typeof itemType; general: boolean } | null>(null)
  useResetOnAccountChange(() => {
    lastLocallyReadPhraseRef.current = null
  })
  useExpandAdvancedSignal(expandAdvancedSignal, () => {
    setDetailsPresented(true)
    setDetailsOpen(true)
  })

  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const tagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending
  const suggestTags = useSuggestTags()
  const tagSuggestions = useTagSuggestions({
    availableTags,
    title, description, language, disabled: tagMutationPending || tags.atTagLimit,
    request: suggestTags.mutateAsync,
    accept: (suggestion) => tags.acceptSuggestedTag(suggestion, async (name, color) => (await createTag.mutateAsync({ name, color })).id),
  })
  const localRead = useMemo(() => readTypedHabitPhrase(title, locale, itemType, formHelpers.isGeneral), [formHelpers.isGeneral, itemType, locale, title])

  useEffect(() => {
    if (!dueTime && form.getValues('dueEndTime')) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [dueTime, form, setValue])

  const sentence = useMemo(
    () => buildHabitUnderstandingSentence(days, daysList, isFlexible, frequencyUnit, frequencyQuantity, dueTime, locale, translate, intervalWeeks),
    [days, daysList, dueTime, frequencyQuantity, frequencyUnit, intervalWeeks, isFlexible, locale, translate],
  )
  const daily = isHabitDailySchedule(days, isFlexible, frequencyUnit, frequencyQuantity)
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate), [translate])
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(translate, allowance),
    [allowance, translate],
  )

  const emojiAvailability = buildHabitEmojiSuggestionAvailability(title, atMessageLimit || emojiSuggestionLimitReached, {
    titleRequired: t('habits.form.titleRequired'),
    limitReached: astraFallbackCopy.limitMessage,
  })

  const controller = useMemo(() => createHabitFormController({
    action: onSuggestSetup,
    atLimit: atMessageLimit,
    lockedGeneral,
    onReminderEnabledChange,
    onSlipAlertEnabledChange,
    onSuggestionContextChange,
    target: {
      hasSchedule: () => isFlexible || Boolean(frequencyUnit),
      getOwnership: () => phraseOwnership,
      setOwnership: (ownership) => {
        setPhraseOwnership(ownership)
        onPhraseOwnershipChange?.(ownership)
      },
      updateProposal: (update) => setProposal(update),
      setOneTime: () => { if (form.getValues('itemType') !== 'habit') setOneTime() },
      setRecurring,
      setFlexible,
      setGeneral,
      setField: (field, value, validate = false) => setValue(
        field,
        value as never,
        validate ? { shouldDirty: true, shouldValidate: true } : { shouldDirty: true },
      ),
      toggleDay,
    },
  }), [atMessageLimit, form, frequencyUnit, isFlexible, lockedGeneral, onPhraseOwnershipChange, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestionContextChange, onSuggestSetup, phraseOwnership, setFlexible, setGeneral, setOneTime, setPhraseOwnership, setProposal, setRecurring, setValue, toggleDay])

  useEffect(() => {
    const previous = lastLocallyReadPhraseRef.current
    lastLocallyReadPhraseRef.current = { title, itemType, general: formHelpers.isGeneral }
    if (previous?.title === title) {
      if (readPhraseLocally && (previous.itemType !== itemType || previous.general !== formHelpers.isGeneral)) controller.reconcilePhraseOwnership(localRead)
      return
    }
    if (!previous && formHelpers.retiredCadenceTitle === title) return
    controller.readPhrase(readPhraseLocally, localRead, emoji)
  }, [controller, emoji, formHelpers.isGeneral, formHelpers.retiredCadenceTitle, itemType, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

  async function createNewTag() {
    const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
    if (validationError) {
      showError(translate(validationError))
      return
    }
    try {
      await tags.createAndSelectTag(async (name, color) => (await createTag.mutateAsync({ name, color })).id)
    } catch (error: unknown) {
      if (!newTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  async function saveEditedTag() {
    try {
      await tags.saveEditTag(async (id, name, color) => { await updateTag.mutateAsync({ tagId: id, name, color }) })
    } catch (error: unknown) {
      if (!editTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <HabitTypeField formHelpers={formHelpers} lockedGeneral={lockedGeneral} onChange={() => { onSuggestionContextChange?.(); controller.clearProposal() }} />
      <HabitUnderstanding
        showSchedule={itemType !== 'task' && !formHelpers.isGeneral}
        inputRef={titleField.ref}
        value={title}
        error={resolveBackendFormFieldMessage(formHelpers.backendFieldErrors.title, errors.title?.message, t)}
        emoji={emoji}
        days={days}
        daily={daily}
        dayOptions={daysList}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        showCountCorrection={!frequencyUnit || frequencyUnit === 'Week'}
        sentence={sentence}
        consumed={localRead.consumed}
        proposed={proposal.setup}
        scheduleLocked={lockedGeneral === true}
        onValueChange={(value) => {
          controller.setTitle(value)
        }}
        onEmojiSelect={controller.setEmoji}
        onSuggestEmoji={onSuggestEmoji}
        canSuggestEmoji={emojiAvailability.canSuggest}
        isEmojiSuggesting={isEmojiSuggesting}
        emojiSuggestionHint={emojiAvailability.hint}
        emojiSuggestionError={emojiSuggestionError}
        isSuggestionDisabled={isSuggesting && !isEmojiSuggesting}
        onToggleDay={(day) => controller.toggleDay(day, daily, days)}
        onQuantityChange={controller.setQuantity}
        labels={understandingLabels}
      >
        <Input
          label={t('habits.form.description')}
          error={descriptionFailure}
          focusRequest={backendFormFieldFocusRequest('description', formHelpers.backendFocusField, formHelpers.backendFocusRequest)}
          value={description}
          onChange={(value) => setValue('description', value, { shouldDirty: true })}
          multiline
          rows={3}
          maxLength={10000}
        />
      </HabitUnderstanding>

      <AstraFallback
        visible={itemType !== 'task' && !formHelpers.isGeneral && shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
        atLimit={atMessageLimit}
        isSuggesting={isSuggesting}
        {...astraFallbackCopy}
        onAsk={() => void controller.askAstra()}
      />

      <HabitDateField generalLocked={lockedGeneral === true} formHelpers={formHelpers} onRecurrence={controller.setRecurrence} />

      <div className="flex flex-col" style={{ gap: 12 }}>
        <ListRow
          icon={detailsOpen ? 'chevron-down' : 'chevron-right'}
          title={t('habits.form.moreDetails')}
          expanded={detailsOpen}
          controls={detailsPresented ? detailsId : undefined}
          placement="column"
          chevron={false}
          onClick={() => {
            if (detailsOpen) {
              setDetailsOpen(false)
            } else {
              setDetailsPresented(true)
              setDetailsOpen(true)
            }
          }}
        />

        {detailsPresented ? (
          <div
            id={detailsId}
            className="habit-form-disclosure flex flex-col px-4"
            data-open={detailsOpen}
            inert={!detailsOpen ? true : undefined}
            style={{ gap: 24 }}
            onTransitionEnd={(event) => {
              if (!detailsOpen && event.propertyName === 'opacity') setDetailsPresented(false)
            }}
          >
            <HabitScheduleFields
              hidden={itemType === 'task'}
              general={formHelpers.isGeneral}
              generalLocked={lockedGeneral === false}
              onGeneral={() => { onSuggestionContextChange?.(); controller.clearProposal(); setGeneral() }}
              proposed={proposal.setup}
              unit={frequencyUnit ?? null}
              quantity={watch('frequencyQuantity') ?? null}
              flexible={isFlexible}
              disabled={lockedGeneral === true}
              onModeChange={controller.setScheduleMode}
              onChange={controller.setSchedule}
            />
            <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={intervalWeeks} scheduleLocked={lockedGeneral === true} onIntervalWeeksChange={controller.setIntervalWeeks} labels={understandingLabels} />

            <HabitTimingFields formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} />
            <section className="flex flex-col gap-2">
              <FormSectionLabel>{t('habits.form.checklist')}</FormSectionLabel>
              <HabitChecklist
                items={checklistItems}
                editable
                proposedItemCount={proposal.checklistItems}
                onItemsChange={controller.setChecklistItems}
              />
              <ChecklistTemplates
                items={checklistItems}
                onLoad={controller.setChecklistItems}
              />
            </section>

            <SubHabitSection proposed={proposal.subHabits && !rendersGranularSubHabits} t={t}>
              {subHabitChildren}
            </SubHabitSection>

            <HabitAvoidanceFields formHelpers={formHelpers} controller={controller} hasProAccess={hasProAccess} />
            {parentField}
            <section>
              <TagPickerField suggestions={<TagSuggestions suggestions={tagSuggestions} atLimit={tags.atTagLimit} disabled={tagMutationPending} />} tags={availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={tagMutationPending} onToggle={tags.toggleTag} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tags.deleteTag(id, (tagId) => deleteTag.mutateAsync(tagId))} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={tags.showNewTag ? (
                <TagEditorRow
                  error={newTagErrors.fieldErrors.name}
                  focusRequest={newTagErrors.focusRequest}
                  value={tags.newTagName}
                  placeholder={t('habits.form.tagName')}
                  disabled={createTag.isPending}
                  inputAriaLabel={t('habits.form.tagName')}
                  cancelAriaLabel={t('common.cancel')}
                  actionLabel={t('common.add')}
                  onChange={tags.setNewTagName}
                  onCommit={() => void createNewTag()}
                  onCancel={() => { newTagErrors.clearBackendErrors(); tags.setShowNewTag(false) }}
                />
              ) : tags.editingTagId ? (
                <TagEditorRow
                  error={editTagErrors.fieldErrors.name}
                  focusRequest={editTagErrors.focusRequest}
                  value={tags.editTagName}
                  disabled={updateTag.isPending}
                  inputAriaLabel={t('habits.form.tagName')}
                  cancelAriaLabel={t('common.cancel')}
                  actionLabel={t('common.save')}
                  onChange={tags.setEditTagName}
                  onCommit={() => void saveEditedTag()}
                  onCancel={() => { editTagErrors.clearBackendErrors(); tags.cancelEditTag() }}
                />
              ) : undefined} />
              {tags.atTagLimit ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.tagLimit')}</p> : null}
            </section>

            <section>
              <GoalLinkingField
                habitId={habitId}
                onGoalCreated={onGoalCreated ?? onToggleGoal}
                selectedGoalIds={selectedGoalIds}
                atGoalLimit={atGoalLimit}
                onToggleGoal={onToggleGoal}
              />
            </section>

            <EndDateEditor visible={showEndDate} value={endDate} onChange={(value) => setValue('endDate', value, { shouldDirty: true })} t={t} />
          </div>
        ) : null}
      </div>


    </div>
  )
}
