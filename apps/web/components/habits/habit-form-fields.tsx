'use client'

import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'
import { useBackendErrorDisclosure, useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useController } from 'react-hook-form'
import type { Time24 } from '@orbit/shared/contracts/forms'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import {
  buildHabitAstraFallbackCopy,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  formatHabitReminderLabel,
  formatLocaleDayMonth,
  getFriendlyErrorMessage,
  habitFeaturePlan,
  isHabitDailySchedule,
  isFeatureEnabled,
  isHabitAstraLimitReached,
  readHabitPhrase,
  resolveHabitStartDate,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { validateTagForm } from '@orbit/shared/validation'
import { useAppToast } from '@/hooks/use-app-toast'
import { useConfig } from '@/hooks/use-config'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { Skeleton } from '@/components/ui/skeleton'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitUnderstanding, HabitRepeatInterval } from './habit-form-fields/habit-understanding'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { useExpandAdvancedSignal } from './habit-form-fields/use-expand-advanced-signal'

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
      {isSuggesting ? (
        <Skeleton variant="settings" label={readingLabel} />
      ) : (
        <div className="flex flex-col items-start" style={{ gap: 8 }}>
          <PillButton variant="secondary" disabled={atLimit} onClick={onAsk}>{askLabel}</PillButton>
          {!atLimit ? <p className="text-xs text-[var(--fg-3)]">{costLabel}</p> : null}
        </div>
      )}
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
  canUseSubHabits: boolean
  proposed: boolean
  onUpgrade: () => void
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
  if (!visible) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.endDate')}</FormSectionLabel>
      <DateField value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={onChange} />
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
  canUseSubHabits,
  proposed,
  onUpgrade,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.subHabits')}</FormSectionLabel>
      {canUseSubHabits ? (
        <Proposed proposed={proposed && !!children} scope="field" label={t('habits.detail.proposed')}>
          {children}
        </Proposed>
      ) : (
        <ListRow title={t('common.upgrade')} value={t('common.proBadge')} inset={false} onClick={onUpgrade} />
      )}
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

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onPhraseOwnershipChange,
  onResolveSubHabitProposalReady,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  isSuggesting = false,
  readPhraseLocally = false,
  lockedGeneral = null,
  startDate,
  defaultExpanded = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const router = useRouter()
  const locale = resolveSupportedLocale(useLocale())
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { config } = useConfig()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { watch, setValue, formState: { errors } } = form
  const { field: titleField } = useController({ control: form.control, name: 'title' })
  const title = coalesceFormText(watch('title'))
  const emoji = watch('emoji') ?? ''
  const watchedDays = watch('days')
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const frequencyQuantity = watch('frequencyQuantity') ?? 3
  const intervalWeeks = watch('intervalWeeks') ?? 1
  const frequencyUnit = watch('frequencyUnit')
  const isFlexible = watch('isFlexible') ?? false
  const dueDate = watch('dueDate') ?? ''
  const dueTime = watch('dueTime') ?? ''
  const endDate = watch('endDate') ?? ''
  const description = watch('description') ?? ''
  const reminderEnabled = watch('reminderEnabled') ?? false
  const scheduledReminders = watch('scheduledReminders') ?? []
  const checklistItems = watch('checklistItems') ?? []
  const isBadHabit = watch('isBadHabit') ?? false
  const slipAlertEnabled = watch('slipAlertEnabled') ?? false
  const canUseSubHabits = isFeatureEnabled(config, 'habits.subHabits', habitFeaturePlan(hasProAccess))
  const displayedStartDate = resolveHabitStartDate(startDate, dueDate)
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(defaultExpanded)
  const [detailsPresented, setDetailsPresented] = useAccountScopedState(defaultExpanded)
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const descriptionFailure = formHelpers.backendFieldErrors.description
  useBackendErrorDisclosure(descriptionFailure, formHelpers.backendFocusRequest, () => {
    setDetailsPresented(true)
    setDetailsOpen(true)
  })
  const [proposal, setProposal] = useAccountScopedState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useAccountScopedState({ cadence: false, dueTime: false })
  const lastLocallyReadTitleRef = useRef<string | null>(null)
  useResetOnAccountChange(() => {
    lastLocallyReadTitleRef.current = null
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
  const localRead = useMemo(() => readHabitPhrase(title, locale), [locale, title])

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
      setOneTime,
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
  }), [atMessageLimit, frequencyUnit, isFlexible, lockedGeneral, onPhraseOwnershipChange, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestionContextChange, onSuggestSetup, phraseOwnership, setFlexible, setGeneral, setOneTime, setPhraseOwnership, setProposal, setRecurring, setValue, toggleDay])

  useEffect(() => {
    if (lastLocallyReadTitleRef.current === title) return
    lastLocallyReadTitleRef.current = title
    controller.readPhrase(readPhraseLocally, localRead, emoji)
  }, [controller, emoji, localRead, readPhraseLocally, title])

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
      <HabitUnderstanding
        inputRef={titleField.ref}
        value={title}
        error={resolveBackendFormFieldMessage(formHelpers.backendFieldErrors.title, errors.title?.message, t)}
        emoji={emoji}
        days={days}
        daily={daily}
        dayOptions={daysList}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        sentence={sentence}
        consumed={localRead.consumed}
        proposed={proposal.setup}
        scheduleLocked={lockedGeneral === true}
        onValueChange={(value) => {
          controller.setTitle(value)
        }}
        onEmojiSelect={controller.setEmoji}
        isSuggestionDisabled={isSuggesting}
        onToggleDay={(day) => controller.toggleDay(day, daily, days)}
        onQuantityChange={controller.setQuantity}
        labels={understandingLabels}
      />

      <AstraFallback
        visible={shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
        atLimit={atMessageLimit}
        isSuggesting={isSuggesting}
        {...astraFallbackCopy}
        onAsk={() => void controller.askAstra()}
      />

      <div className="flex flex-col" style={{ gap: 12 }}>
        <ListRow
          icon={detailsOpen ? 'chevron-down' : 'chevron-right'}
          title={t('habits.form.moreDetails')}
          inset={false}
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
            className="habit-form-disclosure flex flex-col px-4"
            data-open={detailsOpen}
            inert={!detailsOpen ? true : undefined}
            style={{ gap: 24 }}
            onTransitionEnd={(event) => {
              if (!detailsOpen && event.propertyName === 'opacity') setDetailsPresented(false)
            }}
          >
            <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={intervalWeeks} scheduleLocked={lockedGeneral === true} onIntervalWeeksChange={controller.setIntervalWeeks} labels={understandingLabels} />

            <section>
              <TimeField
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={dueTime as Time24 | ''}
                onChange={controller.setDueTime}
                onClear={controller.clearDueTime}
              />
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
                onSetScheduledReminders={(items) => setValue('scheduledReminders', items, { shouldDirty: true })}
                onValidationError={showError}
                t={t}
              />
            </section>

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

            <SubHabitSection canUseSubHabits={canUseSubHabits} proposed={proposal.subHabits && !rendersGranularSubHabits} onUpgrade={() => requestHabitCreateNavigation(() => router.push('/upgrade'))} t={t}>
              {subHabitChildren}
            </SubHabitSection>

            <section className="flex items-center justify-between" style={{ gap: 16 }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] text-[var(--fg-1)]">{t('habits.form.habitTypeAvoid')}</p>
                <p className="truncate text-sm text-[var(--fg-3)]">{t('habits.form.habitTypeAvoidHint')}</p>
              </div>
              <Switch
                label={t('habits.form.habitTypeAvoid')}
                checked={isBadHabit}
                onChange={(checked) => setValue('isBadHabit', checked, { shouldDirty: true })}
              />
            </section>

            <SlipAlertEditor visible={isBadHabit} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} t={t} />

            <section>
              <TagPickerField tags={availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={tagMutationPending} onToggle={tags.toggleTag} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tags.deleteTag(id, (tagId) => deleteTag.mutateAsync(tagId))} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={tags.showNewTag ? (
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
                selectedGoalIds={selectedGoalIds}
                atGoalLimit={atGoalLimit}
                onToggleGoal={onToggleGoal}
              />
            </section>

            <EndDateEditor visible={showEndDate} value={endDate} onChange={(value) => setValue('endDate', value, { shouldDirty: true })} t={t} />

            <section>
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
            </section>
          </div>
        ) : null}
      </div>

      {displayedStartDate ? (
        <section className="flex flex-col" style={{ gap: 4 }}>
          <span className="text-xs text-[var(--fg-3)]">{t('habits.form.startDate')}</span>
          <span className="text-[17px] text-[var(--fg-1)]">{t('habits.form.startDateValue', { date: formatLocaleDayMonth(displayedStartDate, locale) })}</span>
          <span className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('habits.form.startDateReason')}</span>
        </section>
      ) : null}
    </div>
  )
}
